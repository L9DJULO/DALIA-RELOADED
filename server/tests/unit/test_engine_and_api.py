import copy
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.routes import router
from app.auth.deps import get_optional_user
from app.db.session import get_db
from app.middleware import TrafficLimits
from app.models.draft import DraftRequest
from app.services.draft_engine import DraftEngine


@pytest.mark.asyncio
async def test_recommendation_preserves_input_and_disables_unavailable_wpa(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    body = DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 59}, {"champion_id": 222}]},
        champion_pool={"top": [{"champion_id": 78, "tier": "A"}, {"champion_id": 75, "tier": "A"}]}, enable_wildcard=False)
    before = body.model_dump()
    result = await engine.recommend(body)
    assert body.model_dump() == before
    assert len(result.recommendations) == 2
    assert all(r.is_pool_champion for r in result.recommendations)
    assert all(r.wpa is None for r in result.recommendations)
    assert result.win_probability is None
    assert any(r.mechanics for r in result.recommendations)


@pytest.mark.asyncio
async def test_advantages_are_relative_to_pool_mean_with_uncertainty(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    body = DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 59, "role": "jungle"}]},
        champion_pool={"top": [{"champion_id": 78, "tier": "S"}, {"champion_id": 75, "tier": "B"}, {"champion_id": 54, "tier": "D"}]},
        enable_wildcard=True)
    result = await engine.recommend(body)
    pool = [r for r in result.recommendations if r.is_pool_champion]
    assert abs(sum(r.total_score for r in pool)) < 0.02  # arrondis à deux décimales
    assert result.recommendations == sorted(result.recommendations, key=lambda r: r.total_score, reverse=True)
    for r in result.recommendations:
        assert r.score_sd > 0
        assert r.score_range == [round(r.total_score - r.score_sd, 2), round(r.total_score + r.score_sd, 2)]
        assert r.breakdown.terms and {t.name for t in r.breakdown.terms} >= {"meta", "mastery", "mechanics"}
        assert 8 <= r.confidence <= 95
    assert result.recommendations[0].tie_with_leader
    assert result.top_group_ids[0] == result.recommendations[0].champion_id
    assert result.rank_bucket is None and result.data_status["rank"] == catalog.fetcher.TIER


@pytest.mark.asyncio
async def test_future_opponent_term_only_when_lane_opponent_unknown(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    blind = await engine.recommend(DraftRequest(draft_state={"my_role": "top"},
        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False))
    assert all(any(t.name == "future_opponent" for t in r.breakdown.terms) for r in blind.recommendations)
    known = await engine.recommend(DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 24, "role": "top"}]},
        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False))
    assert all(r.breakdown.draft_risk == 0 and all(t.name != "future_opponent" for t in r.breakdown.terms) for r in known.recommendations)


@pytest.mark.asyncio
async def test_preferences_scale_terms_and_rank_reaches_the_source(catalog):
    engine = DraftEngine(catalog, catalog.fetcher)
    seen = []
    async def fetch(role="mid", patch="current", tier=None):
        seen.append(tier); return {}
    catalog.fetcher.fetch_tierlist = fetch
    pool = {"top": [{"champion_id": 78, "tier": "S"}, {"champion_id": 75, "tier": "D"}]}
    result = await engine.recommend(DraftRequest(draft_state={"my_role": "top"}, champion_pool=pool,
        enable_wildcard=False, weight_overrides={"mastery": 1.5}, rank_bucket="GOLD"))
    assert "gold_plus" in seen and result.rank_bucket == "gold" and result.data_status["rank"] == "gold_plus"
    mastery = {r.champion_id: r.breakdown.mastery for r in result.recommendations}
    plain = await engine.recommend(DraftRequest(draft_state={"my_role": "top"}, champion_pool=pool,
        enable_wildcard=False, rank_bucket="gold"))
    plain_mastery = {r.champion_id: r.breakdown.mastery for r in plain.recommendations}
    assert mastery[75] == pytest.approx(plain_mastery[75] * 1.5, abs=0.02)


@pytest.mark.asyncio
async def test_personal_refresh_does_not_block_draft(catalog):
    from unittest.mock import Mock
    personal = Mock()
    personal.get_champion_personal.return_value = None
    personal.get_mastery_entry.return_value = None
    body = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}]},
                        enable_wildcard=False, puuid="valid-puuid-123456")
    await DraftEngine(catalog, catalog.fetcher).recommend(body, personal)
    personal.refresh_in_background.assert_called_once()
    personal.get_personal_stats.assert_not_called()


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


def test_compare_and_pool_advice_routes(client):
    response = client.post('/api/draft/compare', json={"draft_state": {"my_role": "top", "enemy_picks": [{"champion_id": 59}]}, "champion_ids": [78, 75]})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["left"]["champion_id"] == 78 and data["right"]["champion_id"] == 75
    assert data["wpa_delta_pp"] is None
    assert any(d["dimension"] == "mechanics" and d["delta"] > 0 for d in data["dimensions"])
    advice = client.post('/api/pool/advice', json={"role": "top", "champion_pool": {"top": [{"champion_id": 75}]}})
    assert advice.status_code == 200 and advice.json()["suggestions"]


def test_invalid_id_and_unavailable_choice(client):
    assert client.post('/api/draft/compare', json={"draft_state": {}, "champion_ids": [9999, 75]}).status_code == 422
    assert client.post('/api/draft/compare', json={"draft_state": {"bans": [78]}, "champion_ids": [78, 75]}).status_code == 422


def test_body_limit_and_rate_limit(client):
    assert client.post('/api/draft/recommend', content='x' * 100001).status_code == 413
    for _ in range(60): response = client.post('/api/draft/recommend', json={})
    assert response.status_code == 429 and response.headers['retry-after'] == '60'


def test_not_ready_and_ml_status_are_503(client):
    client.app.state.ready = False
    assert client.get('/api/champions').status_code == 503
    assert client.get('/api/ml/status').status_code == 503


@pytest.mark.asyncio
async def test_wpa_compares_eligible_choices_in_the_same_context(catalog):
    class ValidatedPredictor:
        metadata = {"schema_version": 2, "patches": ["16.17"]}
        def supports(self, *args): return True
        def score_with_explanation(self, cid, role, draft):
            p = .56 if cid == 78 else .52
            return p * 100, {"win_probability": p, "confidence": "medium", "known_champions": 8}
    engine = DraftEngine(catalog, catalog.fetcher)
    engine.ml = ValidatedPredictor()
    body = DraftRequest(draft_state={"my_role": "top"}, enable_wildcard=False,
                        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]})
    results = {r.champion_id: r for r in (await engine.recommend(body)).recommendations}
    assert results[78].wpa['delta_pp'] == 2 and results[75].wpa['delta_pp'] == -2
    assert results[78].breakdown.wpa_adjustment == pytest.approx(2.0)
    assert results[75].breakdown.wpa_adjustment == pytest.approx(-2.0)
    assert any(t.name == 'model' for t in results[78].breakdown.terms)
    assert results[78].wpa['baseline_probability'] == 54
    assert results[78].wpa['source'] == 'DALIA'


@pytest.mark.asyncio
async def test_failed_inference_cannot_be_shown_as_fifty_percent(catalog):
    class BrokenPredictor:
        def supports(self, *args): return True
        def score_with_explanation(self, *args): raise RuntimeError('inference failed')
    engine = DraftEngine(catalog, catalog.fetcher); engine.ml = BrokenPredictor()
    body = DraftRequest(draft_state={"my_role": "top"}, enable_wildcard=False,
                        champion_pool={"top": [{"champion_id": 78}]})
    result = await engine.recommend(body)
    assert result.recommendations[0].breakdown.ml_explanation is None
    assert result.recommendations[0].wpa is None
    assert result.win_probability is None


def test_compare_reports_terms_and_tie(client):
    response = client.post('/api/draft/compare', json={"draft_state": {"my_role": "top", "enemy_picks": [{"champion_id": 59}]}, "champion_ids": [78, 75], "rank_bucket": "SILVER"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert "combined_sd" in data and isinstance(data["tied"], bool)
    assert {d["dimension"] for d in data["dimensions"]} >= {"meta", "mastery", "mechanics"}
    assert data["data_status"]["rank"] == "silver"


@pytest.mark.asyncio
async def test_profile_rank_is_used_when_request_has_none(catalog):
    from app.api.routes import _apply_account_context
    from types import SimpleNamespace
    body = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}]})
    user = SimpleNamespace(rank_tier="DIAMOND", id=None)
    await _apply_account_context(body, user, None)
    assert body.rank_bucket == "diamond"
    explicit = DraftRequest(draft_state={"my_role": "top"}, champion_pool={"top": [{"champion_id": 78}]}, rank_bucket="gold")
    await _apply_account_context(explicit, user, None)
    assert explicit.rank_bucket == "gold"
