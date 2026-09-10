import time
from unittest.mock import AsyncMock, patch
import pytest
from app.config import config
from app.services.personal_stats import MASTERY_TTL, PersonalStatsService
from app.services.storage import cache_key


def test_champion_personal_reads_fresh_cache_only():
    svc = PersonalStatsService()
    key = cache_key("puuid-1234567890", "EUW1", "ranked", 50)
    svc._cache[key] = {"ts": time.time(), "data": {"champions": {"103_mid": {"games": 12, "win_rate": 58.3}}}}
    assert svc.get_champion_personal("puuid-1234567890", 103, "mid", "euw1") == {"games": 12, "win_rate": 58.3}
    assert svc.get_champion_personal("puuid-1234567890", 61, "mid") is None
    svc._cache[key]["ts"] = 0
    assert svc.get_champion_personal("puuid-1234567890", 103, "mid") is None
    assert not hasattr(svc, "get_champion_score_boost")


@pytest.mark.asyncio
async def test_mastery_is_fetched_once_and_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "riot_api_key", "RGAPI-test")
    monkeypatch.setattr("app.services.personal_stats.CACHE_DIR", tmp_path)
    svc = PersonalStatsService()
    svc._budget.acquire = AsyncMock()
    payload = [{"championId": 103, "championPoints": 250000, "lastPlayTime": 1_757_000_000_000}]
    class Resp:
        status_code = 200
        headers = {}
        def json(self): return payload
    with patch("app.services.personal_stats.httpx.AsyncClient") as client_cls:
        client = client_cls.return_value.__aenter__.return_value
        client.get = AsyncMock(return_value=Resp())
        first = await svc.get_mastery("puuid-1234567890", "EUW1")
        second = await svc.get_mastery("puuid-1234567890", "EUW1")
        assert client.get.await_count == 1
    assert first == second == {103: {"points": 250000, "last_played": 1_757_000_000.0}}
    assert svc.get_mastery_entry("puuid-1234567890", 103, "EUW1")["points"] == 250000
    assert svc.get_mastery_entry("puuid-1234567890", 61, "EUW1") is None
    assert MASTERY_TTL == 86400


@pytest.mark.asyncio
async def test_mastery_without_api_key_is_empty(monkeypatch):
    monkeypatch.setattr(config, "riot_api_key", "")
    assert await PersonalStatsService().get_mastery("puuid-1234567890") == {}
