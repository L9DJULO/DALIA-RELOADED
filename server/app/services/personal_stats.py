"""Personal match stats — fetches a player's ranked history via Riot API.

Uses the player's PUUID (from LCU) to get their recent SoloQ/FlexQ games
and computes per-champion, per-role statistics for personalised recommendations.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.config import config

logger = logging.getLogger("dalia.personal")

# Region → routing value for match-v5
PLATFORM_TO_REGIONAL = {
    "EUW1": "europe", "EUN1": "europe", "TR1": "europe", "RU": "europe",
    "NA1": "americas", "BR1": "americas", "LA1": "americas", "LA2": "americas",
    "KR": "asia", "JP1": "asia",
    "OC1": "sea", "PH2": "sea", "SG2": "sea", "TH2": "sea", "TW2": "sea", "VN2": "sea",
    # Lowercase aliases
    "euw1": "europe", "eun1": "europe", "tr1": "europe", "ru": "europe",
    "na1": "americas", "br1": "americas", "la1": "americas", "la2": "americas",
    "kr": "asia", "jp1": "asia",
    "oc1": "sea", "ph2": "sea", "sg2": "sea", "th2": "sea", "tw2": "sea", "vn2": "sea",
}

LCU_ROLE_MAP = {
    "TOP": "top", "JUNGLE": "jungle", "MIDDLE": "mid",
    "BOTTOM": "bot", "UTILITY": "support",
    # Already mapped variants
    "top": "top", "jungle": "jungle", "mid": "mid",
    "bot": "bot", "support": "support",
}

CACHE_DIR = Path(config.cache_dir) / "personal"
CACHE_TTL = 600  # 10 minutes


class ChampionPersonalStats:
    """Stats for a single champion+role for a player."""

    def __init__(self):
        self.games: int = 0
        self.wins: int = 0
        self.kills: float = 0.0
        self.deaths: float = 0.0
        self.assists: float = 0.0
        self.cs_per_min: float = 0.0
        self.vision_score: float = 0.0
        self.damage_per_min: float = 0.0

    @property
    def win_rate(self) -> float:
        return (self.wins / self.games * 100) if self.games > 0 else 0.0

    @property
    def kda(self) -> float:
        return ((self.kills + self.assists) / max(self.deaths, 1))

    def to_dict(self) -> dict:
        return {
            "games": self.games,
            "wins": self.wins,
            "win_rate": round(self.win_rate, 1),
            "kda": round(self.kda, 2),
            "avg_kills": round(self.kills / max(self.games, 1), 1),
            "avg_deaths": round(self.deaths / max(self.games, 1), 1),
            "avg_assists": round(self.assists / max(self.games, 1), 1),
            "cs_per_min": round(self.cs_per_min / max(self.games, 1), 1),
            "vision_score": round(self.vision_score / max(self.games, 1), 1),
            "damage_per_min": round(self.damage_per_min / max(self.games, 1), 0),
        }


class PersonalStatsService:
    """Fetches and caches personal ranked stats for a player."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}  # puuid → { ts, data }
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    async def get_personal_stats(
        self,
        puuid: str,
        region: str = "EUW1",
        queue: str = "ranked",
        count: int = 50,
    ) -> Dict[str, Any]:
        """Get personal champion stats from recent ranked games.

        Returns: {
            "puuid": str,
            "games_analyzed": int,
            "champions": { "<champion_id>_<role>": ChampionPersonalStats.to_dict() },
            "role_distribution": { "top": N, "jungle": N, ... },
            "overall": { "games", "wins", "win_rate" },
        }
        """
        # Check in-memory cache
        cached = self._cache.get(puuid)
        if cached and (time.time() - cached["ts"]) < CACHE_TTL:
            return cached["data"]

        # Check disk cache
        disk_cache = self._load_disk_cache(puuid)
        if disk_cache:
            self._cache[puuid] = {"ts": time.time(), "data": disk_cache}
            return disk_cache

        # Fetch from Riot API
        api_key = config.riot_api_key
        if not api_key:
            logger.warning("No RIOT_API_KEY set — cannot fetch personal stats")
            return self._empty_result(puuid)

        try:
            data = await self._fetch_and_compute(puuid, region, api_key, queue, count)
            self._cache[puuid] = {"ts": time.time(), "data": data}
            self._save_disk_cache(puuid, data)
            return data
        except Exception as exc:
            logger.error("Failed to fetch personal stats for %s: %s", puuid, exc)
            return self._empty_result(puuid)

    async def _fetch_and_compute(
        self, puuid: str, region: str, api_key: str, queue: str, count: int
    ) -> Dict[str, Any]:
        """Fetch match history and compute per-champion stats."""
        regional = PLATFORM_TO_REGIONAL.get(region, "europe")
        regional_base = f"https://{regional}.api.riotgames.com"
        headers = {"X-Riot-Token": api_key}

        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Get recent match IDs
            queue_id = 420 if queue == "ranked" else 440  # 420=SoloQ, 440=Flex
            url = f"{regional_base}/lol/match/v5/matches/by-puuid/{puuid}/ids"
            params = {"queue": queue_id, "type": "ranked", "start": 0, "count": count}

            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code != 200:
                logger.warning("Match IDs fetch failed: %d %s", resp.status_code, resp.text[:200])
                return self._empty_result(puuid)

            match_ids: List[str] = resp.json()
            if not match_ids:
                return self._empty_result(puuid)

            # 2. Fetch each match detail (with basic rate limiting)
            champions: Dict[str, ChampionPersonalStats] = {}
            role_dist: Dict[str, int] = {"top": 0, "jungle": 0, "mid": 0, "bot": 0, "support": 0}
            total_games = 0
            total_wins = 0

            for i, mid in enumerate(match_ids):
                # Basic rate limiting: 1 req per 60ms ≈ 16/s (safe for dev key 20/s)
                if i > 0 and i % 15 == 0:
                    import asyncio
                    await asyncio.sleep(1.2)

                match_url = f"{regional_base}/lol/match/v5/matches/{mid}"
                try:
                    match_resp = await client.get(match_url, headers=headers)
                    if match_resp.status_code == 429:
                        # Rate limited — wait and retry
                        retry_after = int(match_resp.headers.get("Retry-After", "5"))
                        import asyncio
                        await asyncio.sleep(retry_after + 1)
                        match_resp = await client.get(match_url, headers=headers)

                    if match_resp.status_code != 200:
                        continue

                    match_data = match_resp.json()
                except Exception:
                    continue

                # 3. Extract this player's stats
                info = match_data.get("info", {})
                duration_min = info.get("gameDuration", 0) / 60.0
                if duration_min < 5:  # skip remakes
                    continue

                participant = None
                for p in info.get("participants", []):
                    if p.get("puuid") == puuid:
                        participant = p
                        break

                if not participant:
                    continue

                champ_id = participant.get("championId", 0)
                raw_role = participant.get("teamPosition", "") or participant.get("individualPosition", "")
                role = LCU_ROLE_MAP.get(raw_role, "mid")
                won = participant.get("win", False)

                key = f"{champ_id}_{role}"
                if key not in champions:
                    champions[key] = ChampionPersonalStats()

                stats = champions[key]
                stats.games += 1
                stats.wins += 1 if won else 0
                stats.kills += participant.get("kills", 0)
                stats.deaths += participant.get("deaths", 0)
                stats.assists += participant.get("assists", 0)
                stats.cs_per_min += (
                    participant.get("totalMinionsKilled", 0) +
                    participant.get("neutralMinionsKilled", 0)
                ) / max(duration_min, 1)
                stats.vision_score += participant.get("visionScore", 0)
                stats.damage_per_min += participant.get("totalDamageDealtToChampions", 0) / max(duration_min, 1)

                role_dist[role] = role_dist.get(role, 0) + 1
                total_games += 1
                total_wins += 1 if won else 0

            logger.info(
                "Personal stats for %s: %d games, %d champions",
                puuid[:8], total_games, len(champions),
            )

            return {
                "puuid": puuid,
                "games_analyzed": total_games,
                "champions": {k: v.to_dict() for k, v in champions.items()},
                "role_distribution": role_dist,
                "overall": {
                    "games": total_games,
                    "wins": total_wins,
                    "win_rate": round(total_wins / max(total_games, 1) * 100, 1),
                },
            }

    def get_champion_score_boost(
        self,
        puuid: str,
        champion_id: int,
        role: str,
    ) -> float:
        """Get a personal score multiplier for a champion.

        Returns a value between 0.8 and 1.2 based on personal performance.
        - 1.0 = neutral (no data or average)
        - >1.0 = player performs well on this champion
        - <1.0 = player underperforms on this champion
        """
        cached = self._cache.get(puuid)
        if not cached:
            return 1.0

        data = cached["data"]
        key = f"{champion_id}_{role}"
        champ_stats = data.get("champions", {}).get(key)
        if not champ_stats or champ_stats["games"] < 3:
            return 1.0

        # Score based on win rate deviation from 50% and games played
        wr = champ_stats["win_rate"]
        games = champ_stats["games"]

        # Win rate component: +/- 10% boost capped
        wr_boost = (wr - 50) / 100  # -0.5 to +0.5
        wr_boost = max(-0.15, min(0.15, wr_boost))

        # Confidence from games played (more games = stronger signal)
        confidence = min(games / 20, 1.0)  # Full confidence at 20+ games

        return 1.0 + (wr_boost * confidence)

    def _empty_result(self, puuid: str) -> Dict[str, Any]:
        return {
            "puuid": puuid,
            "games_analyzed": 0,
            "champions": {},
            "role_distribution": {},
            "overall": {"games": 0, "wins": 0, "win_rate": 0},
        }

    def _load_disk_cache(self, puuid: str) -> Optional[Dict]:
        path = CACHE_DIR / f"{puuid[:16]}.json"
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            # Check TTL (10 min)
            if time.time() - data.get("_cached_at", 0) > CACHE_TTL:
                return None
            return data
        except Exception:
            return None

    def _save_disk_cache(self, puuid: str, data: Dict):
        try:
            cache_data = {**data, "_cached_at": time.time()}
            path = CACHE_DIR / f"{puuid[:16]}.json"
            path.write_text(json.dumps(cache_data, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to save personal cache: %s", exc)
