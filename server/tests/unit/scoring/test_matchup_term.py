import math
from unittest.mock import AsyncMock
import pytest
from app.models.draft import DraftState
from app.scoring.matchup_term import matchup_term
from app.scoring.shrink import shrink, shrink_sd
from app.services.matchup import MatchupAnalyzer


@pytest.mark.asyncio
async def test_lane_and_offlane_contributions(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    async def fetch(slug, role, patch="counter_default", vs_lane=None, tier=None):
        if vs_lane is None:
            return {"stats": {"wr": 50}, "counters": [{"cid": 75, "vsWr": 54., "n": 800, "d1": 4, "d2": 4}]}
        return {"stats": {"wr": 50}, "counters": [{"cid": 59, "vsWr": 48., "n": 200, "d1": -2, "d2": -2}]}
    catalog.fetcher.fetch_counter_page = fetch
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}, {"champion_id": 59, "role": "jungle"}])
    draft.role_distributions = {75: {"top": 1.0}, 59: {"jungle": 1.0}}
    term = await matchup_term(analyzer, 78, "top", draft, "emerald_plus")
    expected = shrink(4, 800, 200) + 0.5 * shrink(-2, 200, 200)
    assert math.isclose(term.value, expected)
    assert math.isclose(term.sd, math.sqrt(shrink_sd(800, 200) ** 2 + (0.5 * shrink_sd(200, 200)) ** 2))
    assert term.source == "observed" and term.sample == 1000


@pytest.mark.asyncio
async def test_missing_data_uses_kit_estimate_with_wide_sd(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={})
    draft = DraftState(my_role="top", enemy_picks=[{"champion_id": 75, "role": "top"}])
    draft.role_distributions = {75: {"top": 1.0}}
    term = await matchup_term(analyzer, 78, "top", draft, None)
    est, _ = analyzer.estimate_matchup(78, 75, True)
    assert math.isclose(term.value, (est - 50.0) * 0.2)
    assert term.sd == 3.0 and term.source == "heuristic"


@pytest.mark.asyncio
async def test_no_enemy_gives_no_term(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    assert await matchup_term(analyzer, 78, "top", DraftState(my_role="top"), None) is None


@pytest.mark.asyncio
async def test_counter_cache_is_keyed_by_tier(catalog):
    analyzer = MatchupAnalyzer(catalog, catalog.fetcher)
    seen = []
    async def fetch(slug, role, patch="counter_default", vs_lane=None, tier=None):
        seen.append(tier)
        return {"stats": {"wr": 50}, "counters": [{"cid": 75, "vsWr": 54., "n": 800, "d1": 4, "d2": 4}]}
    catalog.fetcher.fetch_counter_page = fetch
    await analyzer.load_matchups(78, "top", tier="iron")
    await analyzer.load_matchups(78, "top", tier="gold")
    await analyzer.load_matchups(78, "top", tier="iron")
    assert seen == ["iron", "gold"]
    assert analyzer.counters(78, "top", "iron")[75][3] == 4
