import math
from unittest.mock import AsyncMock
import pytest
from app.models.champion import ChampionStats
from app.scoring.meta_term import meta_term
from app.scoring.shrink import shrink, shrink_sd
from app.services.meta_analyzer import MetaAnalyzer


def test_meta_term_is_shrunk_win_rate_delta():
    t = meta_term(ChampionStats(champion_id=1, role="mid", win_rate=53.0, games=1500))
    assert t.name == "meta" and t.source == "observed" and t.sample == 1500
    assert math.isclose(t.value, shrink(3.0, 1500, 500))
    assert math.isclose(t.sd, shrink_sd(1500, 500))


def test_meta_term_without_stats_is_neutral_and_uncertain():
    t = meta_term(None)
    assert t.value == 0.0 and t.sd == 3.0 and t.source == "heuristic"


@pytest.mark.asyncio
async def test_meta_stats_are_kept_per_tier_and_default_tier_feeds_catalog(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    calls = []
    async def fetch(role="mid", patch="current", tier=None):
        calls.append(tier)
        if tier == "iron":
            return {"cid": {"103": {"wr": 49, "games": 300, "pr": 3, "br": 1}}}
        return {"cid": {"103": {"wr": 52, "games": 8000, "pr": 3, "br": 1}}}
    catalog.fetcher.fetch_tierlist = fetch
    await meta.load_tierlist("mid")
    await meta.load_tierlist("mid", tier="iron")
    assert meta.stats(103, "mid").win_rate == 52
    assert meta.stats(103, "mid", "iron").win_rate == 49
    assert catalog.get_stats(103, "mid").games == 8000, "le catalogue garde le tier par défaut"
    assert "iron" in calls


@pytest.mark.asyncio
async def test_empty_tier_falls_back_to_default_tier(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    async def fetch(role="mid", patch="current", tier=None):
        return {} if tier == "iron" else {"cid": {"103": {"wr": 52, "games": 8000, "pr": 3, "br": 1}}}
    catalog.fetcher.fetch_tierlist = fetch
    await meta.load_tierlist("mid", tier="iron")
    assert meta.stats(103, "mid", "iron").win_rate == 52
    assert "iron" in meta.rank_fallback
