import math
from unittest.mock import AsyncMock
import pytest
from app.models.draft import DraftState
from app.scoring.opponent_model import (expected_delta, future_opponent_term, opponent_distribution,
                                        role_identification_probability)
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer


def test_distribution_mixes_meta_and_counter_and_sums_to_one():
    cands = [(1, 10.0, -3.0), (2, 10.0, 0.0), (3, 5.0, 1.0)]
    d0 = opponent_distribution(cands, 0.0)
    assert math.isclose(d0[1], 0.4) and math.isclose(sum(d0.values()), 1.0)
    d1 = opponent_distribution(cands, 1.0)
    assert math.isclose(d1[1], 1.0) and d1[2] == 0.0
    half = opponent_distribution(cands, 0.5)
    assert math.isclose(sum(half.values()), 1.0) and half[1] > d0[1]


def test_distribution_without_counter_signal_falls_back_to_meta():
    cands = [(1, 10.0, 2.0), (2, 10.0, None)]
    assert opponent_distribution(cands, 0.5) == opponent_distribution(cands, 0.0)


def test_counter_mass_follows_pick_rate_at_equal_threat():
    """Un counter deux fois plus joué pèse deux fois plus dans la distribution."""
    cands = [(1, 10.0, -4.0), (2, 5.0, -4.0), (3, 10.0, 1.0)]
    d = opponent_distribution(cands, 1.0)
    assert math.isclose(d[1], 2 * d[2])
    assert d[3] == 0.0, "un matchup favorable n'est pas une menace"


def test_rare_hard_counter_weighs_less_than_common_soft_counter():
    """Vel'Koz bot counter fort mais rare ; le pick rate doit le ramener a sa place."""
    cands = [(1, 0.6, -7.0), (2, 12.0, -2.0)]
    d = opponent_distribution(cands, 1.0)
    assert d[2] > d[1]


def test_uniform_pick_rates_keep_counter_mass_proportional_to_threat():
    """Garde anti-regression : a pick rates egaux, on retrouve le comportement d'avant."""
    cands = [(1, 10.0, -6.0), (2, 10.0, -2.0), (3, 10.0, 0.0)]
    d = opponent_distribution(cands, 1.0)
    assert math.isclose(d[1], 0.75) and math.isclose(d[2], 0.25) and d[3] == 0.0


def test_alpha_concentrates_mass_on_the_worst_matchup():
    cands = [(1, 10.0, -6.0), (2, 10.0, -3.0), (3, 10.0, -1.0)]
    flat = opponent_distribution(cands, 1.0, 1.0)
    sharp = opponent_distribution(cands, 1.0, 3.0)
    assert sharp[1] > flat[1], "le pire matchup capte plus de masse"
    assert sharp[3] < flat[3], "le matchup le plus doux en capte moins"
    assert math.isclose(sum(sharp.values()), 1.0)


def test_alpha_is_monotonic_on_the_worst_matchup():
    cands = [(1, 10.0, -6.0), (2, 10.0, -3.0), (3, 10.0, -1.0)]
    shares = [opponent_distribution(cands, 1.0, a)[1] for a in (1.0, 1.5, 2.0, 3.0)]
    assert shares == sorted(shares), "la concentration croît avec alpha"


def test_alpha_never_breaks_the_no_threat_fallback():
    cands = [(1, 10.0, 2.0), (2, 10.0, None)]
    assert opponent_distribution(cands, 0.5, 3.0) == opponent_distribution(cands, 0.0, 3.0)


def test_counter_alpha_is_a_rank_independent_scalar():
    """counter_lambda encode deja le rang : y redoubler alpha serait du double comptage."""
    from app.config import config
    assert isinstance(config.scoring.counter_alpha, float)
    assert config.scoring.counter_alpha >= 1.0


def test_expected_delta_and_variance():
    value, sd = expected_delta({1: 0.5, 2: 0.5}, {1: -2.0, 2: 2.0})
    assert value == 0.0 and math.isclose(sd, 2.0)
    assert expected_delta({1: 1.0}, {1: 0.7})[1] == 1.0, "plancher d'écart-type"


def test_role_identification_probability(catalog):
    poppy, nasus = catalog.get_by_id(78), catalog.get_by_id(75)
    unfilled = {"top", "jungle", "support", "mid"}
    assert role_identification_probability(nasus, "top", unfilled) == 1.0
    assert math.isclose(role_identification_probability(poppy, "top", unfilled), 1 / 3)
    assert role_identification_probability(poppy, "top", {"top"}) == 1.0


@pytest.mark.asyncio
async def test_future_term_is_absent_when_lane_opponent_known_or_no_picks_left(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    known = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}])
    assert await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", known, None) is None
    full = DraftState(my_role="top", enemy_picks=[{"champion_id": i} for i in (75, 103, 61, 222, 59)])
    assert await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", full, None) is None


@pytest.mark.asyncio
async def test_future_term_expected_over_available_top_laners(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {
        "75": {"wr": 50, "games": 5000, "pr": 10, "br": 1}, "54": {"wr": 50, "games": 5000, "pr": 10, "br": 1},
        "24": {"wr": 50, "games": 5000, "pr": 0.1, "br": 1}}})
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={"stats": {"wr": 50}, "counters": [
        {"cid": 75, "vsWr": 46., "n": 2000, "d1": -4, "d2": -4}, {"cid": 54, "vsWr": 52., "n": 2000, "d1": 2, "d2": 2}]})
    draft = DraftState(my_role="top", bans=[54])
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(69), "top", draft, "iron")
    # Malphite banni, Jax sous le seuil de pick rate → seul Nasus reste : espérance = d2 rétréci de Nasus
    assert term.name == "future_opponent" and term.source == "observed"
    assert math.isclose(term.value, -4 * 2000 / 2200)
    assert term.sd == 1.0


@pytest.mark.asyncio
async def test_future_term_without_counter_page_is_neutral_and_wide(catalog):
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={})
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={})
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", DraftState(my_role="top"), None)
    assert term.value == 0.0 and term.sd == 4.0 and term.source == "heuristic"


@pytest.mark.asyncio
async def test_future_term_without_data_carries_no_outcome_risk(catalog):
    """Branche « aucune page de counters » : c'est de l'ignorance, pas du risque."""
    matchup, meta = MatchupAnalyzer(catalog, catalog.fetcher), MetaAnalyzer(catalog, catalog.fetcher)
    matchup.counters = lambda *a, **k: {}
    meta.load_tierlist = AsyncMock()
    matchup.load_matchups = AsyncMock()
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 103}])
    term = await future_opponent_term(matchup, meta, catalog, catalog.get_by_id(78), "top", draft, None)
    assert term is not None and term.sd > 0.0
    assert term.outcome_sd == 0.0
