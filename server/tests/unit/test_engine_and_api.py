import copy
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.routes import router
from app.auth.deps import get_optional_user
from app.db.session import get_db
from app.middleware import TrafficLimits
from app.models.draft import DraftRequest, Recommendation, ScoreBreakdown, ScoreTerm
from app.scoring.aggregate import rank_shortlist, top_group
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


def test_compare_lists_every_term_the_engine_produced(client, monkeypatch):
    """Une liste de dimensions écrite en dur masque tout terme ajouté après elle (teamfight)."""
    from app.config import config
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    response = client.post('/api/draft/compare', json={"draft_state": {"my_role": "top", "enemy_picks": [{"champion_id": 59}]}, "champion_ids": [78, 75], "rank_bucket": "SILVER"})
    data = response.json()
    produced = {t["name"] for side in ("left", "right") for t in data[side]["breakdown"]["terms"]}
    assert "teamfight" in produced
    assert {d["dimension"] for d in data["dimensions"]} == produced


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


def _rec(cid, name, score, sd, outcome_sd):
    """Une reco portant un terme observe dont l'abs_sd est son sigma.

    Depuis la vague 0,5 `top_group` calcule son seuil avec `comparison_sd` sur les
    TERMES : un `ScoreBreakdown()` vide donnerait un seuil nul et un groupe de tete
    toujours reduit au leader. Avec un seul terme observe par candidat, le seuil vaut
    sqrt(abs_a**2 + abs_b**2), soit 4.24 pour 3.29 et 2.68.
    """
    return Recommendation(champion_id=cid, champion_name=name, champion_key=name,
                          total_score=score, score_sd=sd, outcome_sd=outcome_sd,
                          breakdown=ScoreBreakdown(terms=[
                              ScoreTerm(name="future_opponent", value=score, sd=sd, abs_sd=sd)]))


def test_points_decide_the_order_even_inside_a_statistical_tie():
    """Joueur, 30/09 : « si un perso a +3, le mettre devant ». Twitch +2.9 ne passe
    plus derrière Yunara +1.3 parce qu'elle est moins exposée."""
    scored = [_rec(1, "Yunara", 1.3, 3.2, 0.5), _rec(2, "Twitch", 2.9, 3.0, 2.0), _rec(3, "Jinx", 1.5, 3.3, 1.0)]
    scored, group = rank_shortlist(scored)
    assert [r.champion_name for r in scored] == ["Twitch", "Jinx", "Yunara"]
    assert group == [0, 1, 2]


def test_at_equal_points_the_less_exposed_pick_leads():
    scored = [_rec(1, "Expose", 1.0, 3.0, 2.5), _rec(2, "Sur", 1.0, 3.0, 0.5)]
    scored, _ = rank_shortlist(scored)
    assert [r.champion_name for r in scored] == ["Sur", "Expose"]


def test_top_group_holds_three_picks_at_most():
    scored = [_rec(i, f"C{i}", 2.0 - i * 0.1, 3.0, 0.0) for i in range(6)]
    _, group = rank_shortlist(scored)
    assert group == [0, 1, 2], "six picks à 0.5 point d'écart : seuls les trois premiers forment le groupe"


def test_clear_favourite_stays_alone_at_the_top():
    scored = [_rec(1, "Sur", 1.0, 0.5, 0.0), _rec(2, "Fort", 9.0, 0.5, 0.5)]
    scored, group = rank_shortlist(scored)
    assert group == [0] and scored[0].champion_name == "Fort"


def test_meta_s_tag_survives_the_quarter_win_rate_weight(catalog):
    """Revue du 25/09 : au seuil de 1,5 sur la valeur pondérée, META S était devenu impossible."""
    from app.config import config
    from app.models.draft import DraftState
    from app.scoring.types import Term
    engine = DraftEngine(catalog, catalog.fetcher)
    draft = DraftState(my_role="mid")
    w = config.scoring.meta_wr_weight
    strong = engine._assign_tags(catalog.get_by_id(103), draft, {"meta": Term("meta", 2.0 * w)})
    average = engine._assign_tags(catalog.get_by_id(103), draft, {"meta": Term("meta", 1.0 * w)})
    assert "meta-forte" in strong and "meta-forte" not in average


def test_compare_tie_uses_the_uncertainty_of_the_difference(client):
    """Une constante de conversion commune s'annule entre deux champions (comparison_sd)."""
    from app.scoring.aggregate import comparison_sd
    from app.models.draft import ScoreTerm
    response = client.post('/api/draft/compare', json={"draft_state": {"my_role": "top", "enemy_picks": [{"champion_id": 59}]}, "champion_ids": [78, 75], "rank_bucket": "SILVER"})
    data = response.json()
    left = [ScoreTerm(**t) for t in data["left"]["breakdown"]["terms"]]
    right = [ScoreTerm(**t) for t in data["right"]["breakdown"]["terms"]]
    assert data["combined_sd"] == pytest.approx(comparison_sd(left, right), abs=0.01)


# ── Câblage des termes, vérifié sur ce que le moteur renvoie ──
# Une recherche dans le source prouve l'appel, pas que le terme atteint breakdown.terms.

def _top_request(enemies=()):
    return DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": e} for e in enemies]},
                        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False)


def _terms(result, champion_id):
    rec = next(r for r in result.recommendations if r.champion_id == champion_id)
    return {t.name: t for t in rec.breakdown.terms}


@pytest.mark.asyncio
async def test_teamfight_term_reaches_the_breakdown_only_when_its_lever_is_on(catalog, monkeypatch):
    """Levier coupé : pas de barre « Teamfight 0.0 » sur chaque carte."""
    from app.config import config
    engine = DraftEngine(catalog, catalog.fetcher)
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.0)
    assert "teamfight" not in _terms(await engine.recommend(_top_request()), 78)
    monkeypatch.setattr(config.scoring, "teamfight_scale", 0.5)
    assert "teamfight" in _terms(await engine.recommend(_top_request()), 78)


@pytest.mark.asyncio
async def test_popularity_term_reaches_the_breakdown(catalog):
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {
        "78": {"wr": 50, "games": 9000, "pr": 6, "br": 0}, "75": {"wr": 50, "games": 9000, "pr": 1, "br": 0}}})
    result = await DraftEngine(catalog, catalog.fetcher).recommend(_top_request())
    poppy, nasus = _terms(result, 78)["popularity"], _terms(result, 75)["popularity"]
    assert poppy.value > nasus.value


@pytest.mark.asyncio
async def test_meta_damping_reaches_the_breakdown_with_the_revealed_enemies(catalog, monkeypatch):
    from app.config import config
    monkeypatch.setattr(config.scoring, "meta_context_damping", 1.0)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {"78": {"wr": 54, "games": 9000, "pr": 5, "br": 0}}})
    engine = DraftEngine(catalog, catalog.fetcher)
    blind = _terms(await engine.recommend(_top_request()), 78)["meta"]
    full = _terms(await engine.recommend(_top_request(enemies=(59, 222, 103, 40, 24))), 78)["meta"]
    assert blind.value > 0 and full.value == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_scaling_term_reaches_the_breakdown_against_scalers(catalog, monkeypatch):
    from app.config import config
    from app.scoring import scaling_term as scaling
    data = {"jinx": {"bot": {"delta": 12.0, "games": 90000}},
            "poppy": {"top": {"delta": -5.0, "games": 90000}}, "nasus": {"top": {"delta": 10.0, "games": 90000}}}
    monkeypatch.setattr(scaling, "load_scaling", lambda: data)
    monkeypatch.setattr(config.scoring, "scaling_scale", 1.0)
    body = DraftRequest(draft_state={"my_role": "top", "enemy_picks": [{"champion_id": 222, "role": "bot"}]},
                        champion_pool={"top": [{"champion_id": 78}, {"champion_id": 75}]}, enable_wildcard=False)
    result = await DraftEngine(catalog, catalog.fetcher).recommend(body)
    assert _terms(result, 78)["scaling"].value > 0 > _terms(result, 75)["scaling"].value


def _bot_request(allies):
    return DraftRequest(draft_state={"my_role": "bot", "ally_picks": [{"champion_id": c, "role": r} for c, r in allies]},
                        champion_pool={"bot": [{"champion_id": 222}, {"champion_id": 22}]}, enable_wildcard=False)


@pytest.mark.asyncio
async def test_observed_synergy_reaches_the_breakdown_and_the_details(catalog):
    page = {"team_h": ["id", "wr", "d1", "d2", "pr", "n"], "team": {"support": [[40, 56.0, 0, 3.0, 5, 50000]]}}
    catalog.fetcher.fetch_team_page = AsyncMock(return_value=page)
    result = await DraftEngine(catalog, catalog.fetcher).recommend(_bot_request([(40, "support")]))
    term = _terms(result, 222)["synergy"]
    assert term.source == "observed" and term.value > 0 and term.sample == 50000
    rec = next(r for r in result.recommendations if r.champion_id == 222)
    assert rec.synergy_details[0].source == "observed" and rec.synergy_details[0].games == 50000


@pytest.mark.asyncio
async def test_synergy_falls_back_to_kit_rules_without_a_page(catalog):
    result = await DraftEngine(catalog, catalog.fetcher).recommend(_bot_request([(40, "support")]))
    assert _terms(result, 222)["synergy"].source == "heuristic"
    rec = next(r for r in result.recommendations if r.champion_id == 222)
    assert rec.synergy_details[0].source == "kit_heuristic" and rec.synergy_details[0].games == 0


@pytest.mark.asyncio
async def test_damage_sources_reach_the_composition_term(catalog):
    """Spec composition mesurée : sans vraie source AP chez les alliés, la source AP passe
    devant par le terme de composition (couverture + avertissement évité)."""
    from app.models.champion import DamageDealt
    dealt = {75: (15000, 0), 254: (15000, 0), 222: (23000, 700), 40: (1200, 6200),
             103: (1800, 17000), 157: (20000, 500)}
    for cid, (phys, mag) in dealt.items():
        catalog.get_by_id(cid).damage_dealt = DamageDealt(physical=phys, magic=mag, measured=True)
    body = DraftRequest(draft_state={"my_role": "mid", "ally_picks": [
        {"champion_id": 75, "role": "top"}, {"champion_id": 254, "role": "jungle"},
        {"champion_id": 222, "role": "bot"}, {"champion_id": 40, "role": "support"}]},
        champion_pool={"mid": [{"champion_id": 103}, {"champion_id": 157}]}, enable_wildcard=False)
    result = await DraftEngine(catalog, catalog.fetcher).recommend(body)
    ahri, yasuo = _terms(result, 103)["composition"], _terms(result, 157)["composition"]
    # Ahri couvre l'AP (outil magic_damage) et laisse une seule source (avertissement) ;
    # Yasuo n'en laisse aucune (critique). Quatre alliés : pas d'atténuation.
    from app.config import config
    s = config.scoring
    expected = s.comp_tool_weights["magic_damage"] + s.comp_warning_penalty["critical"] - s.comp_warning_penalty["warning"]
    assert expected > 0 and ahri.value - yasuo.value == pytest.approx(expected)
