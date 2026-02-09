"""Data fetcher — pulls champion stats, matchups from Lolalytics + Data Dragon.

Lolalytics API (Feb 2026):
  • Tier list : GET /mega/?ep=list&v=1&patch={patch}&lane={lane}&tier=emerald_plus&queue=ranked&region=all
  • Counters  : GET /mega/?ep=counter&v=1&patch={patch}&c={slug}&lane={lane}&tier=emerald_plus&queue=ranked&region=all

Data Dragon (static, no key needed):
  • Versions  : GET /api/versions.json
  • Champions : GET /cdn/{ver}/data/en_US/champion.json
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import config

logger = logging.getLogger("dalia.fetcher")

# Lolalytics uses "middle"/"bottom" — our app uses "mid"/"bot"
_ROLE_TO_LANE = {"mid": "middle", "bot": "bottom", "top": "top", "jungle": "jungle", "support": "support"}
_LANE_TO_ROLE = {v: k for k, v in _ROLE_TO_LANE.items()}


def role_to_lane(role: str) -> str:
    return _ROLE_TO_LANE.get(role, role)


def lane_to_role(lane: str) -> str:
    return _LANE_TO_ROLE.get(lane, lane)


# ---------------------------------------------------------------------------
# Cache helper
# ---------------------------------------------------------------------------
class FileCache:
    """Simple file-system JSON cache with TTL."""

    def __init__(self, directory: str, ttl_seconds: int = 6 * 3600):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_seconds

    def _path(self, key: str) -> Path:
        safe = key.replace("/", "_").replace("?", "_").replace("&", "_").replace(":", "_")
        return self.dir / f"{safe}.json"

    def get(self, key: str) -> Optional[Any]:
        p = self._path(key)
        if not p.exists():
            return None
        age = time.time() - p.stat().st_mtime
        if age > self.ttl:
            return None
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    def set(self, key: str, data: Any) -> None:
        p = self._path(key)
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main fetcher
# ---------------------------------------------------------------------------
class LolalyticsFetcher:
    """Async HTTP client for Lolalytics & Data Dragon."""

    DDRAGON = config.ddragon_url
    LOLA = config.lolalytics_base
    TIER = config.rank_tier
    QUEUE = config.queue
    REGION = config.region

    def __init__(self):
        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://lolalytics.com/",
                "Origin": "https://lolalytics.com",
            },
            follow_redirects=True,
        )
        self._cache = FileCache(config.cache_dir, ttl_seconds=config.cache_ttl_hours * 3600)
        self._ddragon_version: Optional[str] = None

    async def close(self):
        await self._client.aclose()

    # ── Data Dragon ──────────────────────────────────────────────────────
    async def get_ddragon_version(self) -> str:
        if self._ddragon_version:
            return self._ddragon_version
        url = f"{self.DDRAGON}/api/versions.json"
        cache_key = "ddragon_versions"
        cached = self._cache.get(cache_key)
        if cached:
            self._ddragon_version = cached[0]
            return self._ddragon_version
        try:
            resp = await self._client.get(url)
            resp.raise_for_status()
            versions = resp.json()
            self._cache.set(cache_key, versions)
            self._ddragon_version = versions[0]
        except Exception as exc:
            logger.warning("Failed to fetch DDragon versions: %s — using fallback", exc)
            self._ddragon_version = "16.3.1"
        return self._ddragon_version

    async def get_current_patch(self) -> str:
        """Return patch id like '16.3'."""
        ver = await self.get_ddragon_version()
        parts = ver.split(".")
        return f"{parts[0]}.{parts[1]}"

    async def get_previous_patch(self) -> str:
        """Rough heuristic: decrement the minor version."""
        cur = await self.get_current_patch()
        major, minor = cur.split(".")
        minor = int(minor)
        if minor > 1:
            return f"{major}.{minor - 1}"
        return cur  # fallback

    async def fetch_all_champions_ddragon(self) -> Dict[str, Any]:
        """Return raw Data Dragon champion.json data dict."""
        ver = await self.get_ddragon_version()
        cache_key = f"ddragon_champions_{ver}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        url = f"{self.DDRAGON}/cdn/{ver}/data/en_US/champion.json"
        try:
            resp = await self._client.get(url)
            resp.raise_for_status()
            data = resp.json()["data"]
            self._cache.set(cache_key, data)
            return data
        except Exception as exc:
            logger.error("DDragon champion fetch failed: %s", exc)
            return {}

    def champion_image_url(self, champion_key: str) -> str:
        ver = self._ddragon_version or "16.3.1"
        return f"{self.DDRAGON}/cdn/{ver}/img/champion/{champion_key}.png"

    # ── Lolalytics — Tier list (ep=list) ─────────────────────────────────
    async def fetch_tierlist(self, role: str = "mid", patch: str = "current") -> Dict[str, Any]:
        """Fetch the tier list for a role. Returns {cid: {wr, pr, br, games, ...}}."""
        lane = role_to_lane(role)
        if patch == "current":
            patch = await self.get_current_patch()

        cache_key = f"lola_list_{lane}_{patch}_{self.TIER}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        url = f"{self.LOLA}/mega/"
        params = {
            "ep": "list",
            "v": "1",
            "patch": patch,
            "lane": lane,
            "tier": self.TIER,
            "queue": self.QUEUE,
            "region": self.REGION,
        }
        try:
            resp = await self._client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            self._cache.set(cache_key, data)
            return data
        except Exception as exc:
            logger.error("Lolalytics tierlist fetch failed (%s %s): %s", lane, patch, exc)
            return {}

    # ── Lolalytics — Champion matchups (ep=counter) ─────────────────────
    async def fetch_counter_page(
        self, champion_slug: str, role: str, patch: str = "counter_default",
        vs_lane: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch matchup (counter) data for a specific champion + role.

        Args:
            champion_slug: Lolalytics slug (e.g. 'nilah', 'kogmaw')
            role: our champion's role (e.g. 'bot')
            patch: patch id, 'current', or 'counter_default' (uses config.counter_patch = '30')
            vs_lane: if set, fetch cross-lane counters (e.g. 'top' to get bot-vs-top matchups)

        Returns: {stats: {...}, counters: [{cid, vsWr, n, d1, d2, allWr, defaultLane}, ...]}
        """
        lane = role_to_lane(role)
        if patch == "counter_default":
            patch = config.counter_patch  # "30" = last 30 days for more data
        elif patch == "current":
            patch = await self.get_current_patch()

        vs_lane_api = role_to_lane(vs_lane) if vs_lane else None
        cache_suffix = f"_vs{vs_lane_api}" if vs_lane_api else ""
        cache_key = f"lola_counter_{champion_slug}_{lane}{cache_suffix}_{patch}_{self.TIER}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        url = f"{self.LOLA}/mega/"
        params = {
            "ep": "counter",
            "v": "1",
            "patch": patch,
            "c": champion_slug.lower(),
            "lane": lane,
            "tier": self.TIER,
            "queue": self.QUEUE,
            "region": self.REGION,
        }
        if vs_lane_api and vs_lane_api != lane:
            params["vslane"] = vs_lane_api

        try:
            resp = await self._client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            if "counters" not in data:
                logger.warning("No counters in response for %s %s (vs %s)", champion_slug, lane, vs_lane_api)
                return {}
            self._cache.set(cache_key, data)
            return data
        except Exception as exc:
            logger.error("Lolalytics counter fetch failed (%s %s vs %s): %s", champion_slug, lane, vs_lane_api, exc)
            return {}

    # ── Parsing helpers ──────────────────────────────────────────────────
    @staticmethod
    def parse_tierlist(raw: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse ep=list response into a flat list of dicts.

        Format: {"cid": {"1": {"wr": 51.2, "pr": 3.5, "br": 1.2, "games": 5000, ...}, ...}}
        """
        results: List[Dict[str, Any]] = []
        cid_data = raw.get("cid", {})
        avg_wr = raw.get("avgWr", 50.0)

        if not isinstance(cid_data, dict):
            return results

        for cid_str, val in cid_data.items():
            try:
                cid = int(cid_str)
            except (ValueError, TypeError):
                continue

            if not isinstance(val, dict):
                continue

            wr = val.get("wr", 0)
            pr = val.get("pr", 0)
            br = val.get("br", 0)
            games = val.get("games", 0)

            # Skip champions with 0 games or 0 WR (not played in this role)
            if games <= 0 or wr <= 0:
                continue

            # Convert string values if needed
            wr = float(wr) if isinstance(wr, str) else wr
            pr = float(pr) if isinstance(pr, str) else pr
            br = float(br) if isinstance(br, str) else br

            results.append({
                "champion_id": cid,
                "games": int(games),
                "win_rate": round(float(wr), 2),
                "pick_rate": round(float(pr), 2),
                "ban_rate": round(float(br), 2),
                "avg_wr": float(avg_wr),
            })

        return results

    @staticmethod
    def parse_counters(raw_counter_page: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Parse ep=counter response.

        Each counter entry: {cid, vsWr, n, d1, d2, allWr, defaultLane}
        - cid: opponent champion id
        - vsWr: our win rate vs this opponent (%)
        - n: games played
        - d1: delta from our average wr (how much better/worse we do vs them)
        - d2: secondary delta (normalised)
        - allWr: opponent's overall win rate
        """
        counters = raw_counter_page.get("counters", [])
        stats = raw_counter_page.get("stats", {})
        our_wr = stats.get("wr", 50.0)
        if isinstance(our_wr, str):
            our_wr = float(our_wr)

        results = []
        for entry in counters:
            if not isinstance(entry, dict):
                continue
            vs_wr = entry.get("vsWr", 50.0)
            if isinstance(vs_wr, str):
                vs_wr = float(vs_wr)
            # d1 = raw delta (vsWr − our avg WR)
            # d2 = normalised delta (accounts for opponent strength too)
            d1 = entry.get("d1", vs_wr - our_wr)
            d2 = entry.get("d2", d1)  # fallback to d1 if d2 missing
            if isinstance(d1, str):
                d1 = float(d1)
            if isinstance(d2, str):
                d2 = float(d2)
            results.append({
                "opponent_id": entry.get("cid", 0),
                "vs_win_rate": vs_wr,
                "games": entry.get("n", 0),
                "delta": round(d1, 2),
                "delta_normalised": round(d2, 2),
                "opponent_overall_wr": entry.get("allWr", 50.0),
                "opponent_default_lane": entry.get("defaultLane", ""),
                "our_wr": our_wr,
            })

        return results

    # ── Champion slug helper ─────────────────────────────────────────────
    @staticmethod
    def key_to_slug(champion_key: str) -> str:
        """Convert Data Dragon key (e.g. 'AurelionSol') to Lolalytics slug ('aurelionsol')."""
        return champion_key.lower().replace("'", "").replace(" ", "")
