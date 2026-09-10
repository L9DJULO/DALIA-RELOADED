import json
import time
from unittest.mock import AsyncMock
import pytest
import httpx
from app.services.storage import cache_key
from app.services.data_fetcher import FileCache, LolalyticsFetcher
from app.services.personal_stats import PersonalStatsService
from app.services.meta_analyzer import MetaAnalyzer
from app.services.matchup import MatchupAnalyzer


def test_cache_paths_are_opaque_and_contained(tmp_path, monkeypatch):
    cache = FileCache(str(tmp_path))
    cache.set('../../escaped', {"ok": True})
    assert cache._path('../../escaped').parent == tmp_path
    assert cache.get('../../escaped') == {"ok": True}
    assert not (tmp_path.parent / 'escaped.json').exists()
    monkeypatch.setattr('app.services.personal_stats.CACHE_DIR', tmp_path)
    personal = PersonalStatsService()
    personal._save_disk_cache('../../outside', {"champions": {}})
    assert len(list(tmp_path.glob('*.json'))) == 2
    assert len({cache_key('puuid', region, queue, count) for region, queue, count in [('EUW1', 'ranked', 50), ('NA1', 'ranked', 50), ('EUW1', 'flex', 50), ('EUW1', 'ranked', 20)]}) == 4


@pytest.mark.asyncio
async def test_version_refresh_bypasses_memory_and_disk(tmp_path):
    fetcher = LolalyticsFetcher()
    fetcher._cache = FileCache(str(tmp_path))
    await fetcher._client.aclose()
    values = iter([['16.16.1'], ['16.17.1']])
    fetcher._client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=next(values))))
    assert await fetcher.get_ddragon_version() == '16.16.1'
    assert await fetcher.get_ddragon_version(force=True) == '16.17.1'
    await fetcher.close()


@pytest.mark.asyncio
async def test_empty_meta_can_recover(catalog):
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    await meta.load_tierlist('mid')
    assert not meta.is_loaded('mid')
    catalog.fetcher.fetch_tierlist = AsyncMock(return_value={"cid": {"103": {"wr": 52, "games": 1000, "pr": 3, "br": 1}}})
    await meta.load_tierlist('mid')
    assert meta.games(103, 'mid') == 1000


@pytest.mark.asyncio
async def test_expired_cross_lane_cache_refetches(catalog):
    matchup = MatchupAnalyzer(catalog, catalog.fetcher)
    matchup._matchup_cache[(78, 'top', 'jungle')] = {59: (60., 100, 5., 5.)}
    matchup._loaded_at[(78, 'top', 'jungle')] = 0
    catalog.fetcher.fetch_counter_page = AsyncMock(return_value={"counters": [{"cid": 59, "vsWr": 48., "n": 100, "d1": -2, "d2": -2}]})
    await matchup.load_matchups(78, 'top', 'jungle')
    assert matchup._matchup_cache[(78, 'top', 'jungle')][59][0] == 48


@pytest.mark.asyncio
async def test_personal_background_refresh_closes_cleanly(tmp_path, monkeypatch):
    monkeypatch.setattr('app.services.personal_stats.CACHE_DIR', tmp_path)
    service = PersonalStatsService()
    service.refresh_in_background('valid-puuid-123')
    await service.close()
    assert not service._refresh_tasks


@pytest.mark.asyncio
async def test_meta_never_blends_overlapping_windows(catalog):
    async def fetch(role, patch, tier=None):
        return {"cid": {"103": {"wr": 60 if patch == "current" else 51,
                                "games": 6000 if patch == "current" else 40000}}}
    catalog.fetcher.fetch_tierlist = fetch
    meta = MetaAnalyzer(catalog, catalog.fetcher)
    await meta.load_tierlist('mid')
    stats = catalog.get_stats(103, 'mid')
    assert stats.win_rate == 60 and stats.games == 6000 and stats.patch == 'current'


@pytest.mark.asyncio
async def test_cross_lane_does_not_use_same_lane_population(catalog):
    matchup = MatchupAnalyzer(catalog, catalog.fetcher)
    matchup._matchup_cache[(78, 'top', None)] = {59: (65, 100, 10, 10)}
    matchup._loaded_at[(78, 'top', None)] = time.time()
    assert await matchup._get_matchup_data(78, 'top', 59, 'jungle') is None


def test_malformed_source_rows_never_become_scores():
    parsed = LolalyticsFetcher.parse_counters({"counters": [
        {"cid": "59", "n": "100", "vsWr": "52"},
        {"cid": 61, "n": 100, "vsWr": "NaN"},
        {"cid": 75, "n": "bad", "vsWr": 50},
        {"cid": 103, "n": 10, "d2": "Infinity"}]})
    assert len(parsed) == 1 and parsed[0]['opponent_id'] == 59


def test_riot_budget_is_shared_and_does_not_store_secrets(tmp_path):
    from app.services.riot_budget import RiotBudget
    first, second = RiotBudget(tmp_path / 'quota.sqlite'), RiotBudget(tmp_path / 'quota.sqlite')
    for _ in range(20): assert first.reserve('private-key', now=1000) == 0
    assert second.reserve('private-key', now=1000) > 1
    for second_number in range(1, 5):
        for _ in range(20): assert second.reserve('private-key', now=1000 + second_number * 2) == 0
    assert first.reserve('private-key', now=1010) == 111
    assert first.reserve('another-key', now=1010) == 0
    assert b'private-key' not in (tmp_path / 'quota.sqlite').read_bytes()
