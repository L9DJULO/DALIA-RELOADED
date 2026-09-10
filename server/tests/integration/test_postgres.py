"""Run against an explicitly named disposable PostgreSQL database only."""
import asyncio
import os
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.api.auth_routes import router as auth
from app.api.user_routes import router as users
from app.api.duo_routes import router as duo
from app.api.history_routes import router as history
from app.db.session import get_db

URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL must target a disposable migrated PostgreSQL database")


@pytest.fixture
def client(catalog):
    assert "test" in URL.rsplit('/', 1)[-1], "Refusing integration writes to a non-test database"
    engine = create_async_engine(URL, poolclass=NullPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    app = FastAPI()
    for router in (auth, users, duo, history): app.include_router(router, prefix="/api")
    app.state.ready = True; app.state.champion_db = catalog
    async def session():
        async with sessions() as db: yield db
    app.dependency_overrides[get_db] = session
    with TestClient(app) as client: yield client
    asyncio.run(engine.dispose())


def register(client, prefix):
    name = prefix + uuid.uuid4().hex[:12]
    response = client.post('/api/auth/register', json={"username": name, "email": name + '@example.com', "password": 'Test-password-123!'})
    assert response.status_code == 201, response.text
    data = response.json()
    return data['user'], {"Authorization": 'Bearer ' + data['access_token']}


def test_account_pool_isolation_and_conflicts(client):
    a, ha = register(client, 'userA'); b, hb = register(client, 'userB')
    collision = client.post('/api/auth/register', json={"username": a['username'], "email": b['email'], "password": 'Test-password-123!'})
    assert collision.status_code == 409
    assert client.post('/api/user/pool', headers=ha, json={"role": "mid", "entries": [{"champion_id": 103, "champion_key": 'wrong', "tier": 'A'}]}).status_code == 200
    assert client.get('/api/user/pool', headers=hb).json()['mid'] == []
    assert client.get('/api/user/pool', headers=ha).json()['mid'][0]['champion_key'] == 'Ahri'
    assert client.post('/api/user/pool', headers=ha, json={"role": "mid", "entries": []}).status_code == 200
    assert client.get('/api/user/pool', headers=ha).json()['mid'] == []


def test_replay_save_is_idempotent_and_private(client):
    _, ha = register(client, 'replayA'); _, hb = register(client, 'replayB')
    state = {"myTeam": "blue", "myRole": "mid", "myPickOrder": 1, "currentAction": 0,
        "blueBans": [None]*5, "redBans": [None]*5, "enemyPicks": [None]*5,
        "allyPicks": dict.fromkeys(['top', 'jungle', 'mid', 'bot', 'support']),
        "allyPrepicks": dict.fromkeys(['top', 'jungle', 'mid', 'bot', 'support'])}
    payload = {"session_id": str(uuid.uuid4()), "my_role": 'mid', "timeline": [{"at": '2026-09-09T10:00:00Z', "state": state}]}
    first = client.post('/api/history', headers=ha, json=payload)
    assert first.status_code == 201, first.text
    again = client.post('/api/history', headers=ha, json=payload)
    assert first.json()['id'] == again.json()['id']
    assert client.get('/api/history', headers=hb).json() == []
    assert client.patch('/api/history/' + first.json()['id'], headers=hb, json={"result": 'win'}).status_code == 404
    listed = client.get('/api/history', headers=ha).json()
    assert len(listed) == 1 and listed[0]['timeline_steps'] == 1 and 'timeline' not in listed[0]
    detail = client.get('/api/history/' + first.json()['id'], headers=ha)
    assert detail.status_code == 200 and len(detail.json()['timeline']) == 1
    assert client.get('/api/history/' + first.json()['id'], headers=hb).status_code == 404
    assert client.get('/api/history?limit=-1', headers=ha).status_code == 422
    # Changing the result must not erase notes the player wrote earlier.
    client.post('/api/history', headers=ha, json={**payload, "notes": "garder"})
    patched = client.patch('/api/history/' + first.json()['id'], headers=ha, json={"result": 'loss'})
    assert patched.json()['notes'] == 'garder' and patched.json()['result'] == 'loss'


def test_concurrent_duo_links_have_one_winner(client):
    from concurrent.futures import ThreadPoolExecutor
    _, ha = register(client, 'duoA'); _, hb = register(client, 'duoB'); _, hc = register(client, 'duoC')
    code = client.get('/api/duo/code', headers=ha).json()['duo_code']
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda headers: client.post('/api/duo/link', headers=headers, json={"code": code}), [hb, hc]))
    assert sorted(r.status_code for r in responses) == [200, 409], [r.text for r in responses]
    assert client.get('/api/duo/status', headers=ha).json()['linked']
