"""Regressions found during the September 2026 review pass."""
import time
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.api.history_routes import HistoryResultUpdate
from app.api.routes import PersonalStatsRequest, router, validate_champion_ids
from app.auth.deps import get_optional_user
from app.db.session import get_db
from app.middleware import TrafficLimits
from app.models.draft import DraftRequest
from app.services.data_fetcher import FileCache, LolalyticsFetcher
from app.services.draft_engine import DraftEngine
from app.services.meta_analyzer import MetaAnalyzer
from app.services.personal_stats import PersonalStatsService


@pytest.mark.parametrize("sent, stored", [("EUW", "EUW1"), ("euw1", "EUW1"), ("EUNE", "EUN1"), ("NA", "NA1"), ("LAS", "LA2"), ("KR", "KR")])
def test_league_client_region_names_are_accepted(sent, stored):
    assert PersonalStatsRequest(puuid="valid-puuid-123456", region=sent).region == stored
    assert DraftRequest(draft_state={}, puuid="valid-puuid-123456", region=sent).region == stored


def test_unknown_region_is_still_rejected():
    with pytest.raises(ValidationError):
        PersonalStatsRequest(puuid="valid-puuid-123456", region="MARS")


def test_result_update_keeps_existing_notes_by_default():
    assert HistoryResultUpdate(result="win").notes is None
    assert HistoryResultUpdate(result="win", notes="").notes == ""


def test_unknown_pool_entries_are_dropped_but_board_ids_are_rejected(catalog):
    body = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}, {"champion_id": 9999}]})
    validate_champion_ids(catalog, body)
    assert [e.champion_id for e in body.champion_pool["top"]] == [78]
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        validate_champion_ids(catalog, DraftRequest(draft_state={"bans": [9999]}))


@pytest.mark.asyncio
async def test_failed_meta_refresh_keeps_previous_sample(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {"103": {"wr": 52, "games": 8000, "pr": 3, "br": 1}}})
    await meta.load_tierlist("mid")
    assert meta.games(103, "mid") == 8000
    meta._loaded_at["mid"] = 0  # TTL expired
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={})
    await meta.load_tierlist("mid")
    assert meta.games(103, "mid") == 8000, "an outage must not erase the last good sample"
    assert "mid" in meta._loaded_roles
    assert time.time() - meta._loaded_at["mid"] < 6 * 3600, "retry is scheduled sooner than the normal TTL"


@pytest.mark.asyncio
async def test_single_missing_page_does_not_trip_source_breaker(tmp_path):
    fetcher = LolalyticsFetcher()
    fetcher._cache = FileCache(str(tmp_path))
    await fetcher._client.aclose()
    def handler(request):
        if "c=unknownchamp" in str(request.url):
            return httpx.Response(404)
        return httpx.Response(200, json={"stats": {"wr": 50}, "counters": [{"cid": 59, "vsWr": 48., "n": 100, "d1": -2, "d2": -2}]})
    fetcher._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert await fetcher.fetch_counter_page("unknownchamp", "top") == {}
    assert fetcher._retry_after.get("lolalytics", 0) <= time.monotonic()
    assert await fetcher.fetch_counter_page("poppy", "top")
    await fetcher.close()


@pytest.mark.asyncio
async def test_personal_stats_failure_is_not_retried_immediately(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.personal_stats.CACHE_DIR", tmp_path)
    monkeypatch.setattr("app.services.personal_stats.config.riot_api_key", "RGAPI-test")
    service = PersonalStatsService()
    calls = []
    async def failing(*args, **kwargs):
        calls.append(1)
        raise RuntimeError("riot down")
    service._fetch_and_compute = failing
    await service.get_personal_stats("valid-puuid-123456")
    await service.get_personal_stats("valid-puuid-123456")
    assert len(calls) == 1
    service.refresh_in_background("valid-puuid-123456")
    await service.close()


@pytest.fixture
def client(catalog):
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.add_middleware(TrafficLimits, max_body=100_000)
    app.state.ready = True
    app.state.champion_db = catalog
    app.state.draft_engine = DraftEngine(catalog, catalog.fetcher)
    async def no_user(): return None
    async def no_db(): yield None
    app.dependency_overrides[get_optional_user] = no_user
    app.dependency_overrides[get_db] = no_db
    return TestClient(app)


def test_declared_oversized_body_is_refused_before_reading(client):
    response = client.post("/api/draft/recommend", content=b"{}", headers={"Content-Length": "500000"})
    assert response.status_code == 413


def test_ml_routes_validate_role_and_count(client):
    assert client.get("/api/ml/similar/78", params={"role": "adc"}).status_code == 422
    assert client.get("/api/ml/similar/78", params={"n": 0}).status_code == 422
    assert client.get("/api/ml/embeddings", params={"role": "top"}).json() == {"embeddings": [], "available": False}


def test_wildcards_are_scored_with_the_same_engine_path(client):
    response = client.post("/api/draft/recommend", json={"draft_state": {"my_role": "top"}, "champion_pool": {"top": [{"champion_id": 75}]}, "enable_wildcard": True})
    assert response.status_code == 200, response.text
    names = {r["champion_name"]: r for r in response.json()["recommendations"]}
    assert "Nasus" in names and names["Nasus"]["is_pool_champion"]
    assert all("hors-pool" in r["tags"] for r in names.values() if not r["is_pool_champion"])
