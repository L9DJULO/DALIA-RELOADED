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
import asyncio
import math
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import config
from app.services.storage import cache_key as hash_key, write_json

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
        safe = hash_key(key)
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

    def collected_at(self, key: str):
        try: return self._path(key).stat().st_mtime
        except OSError: return None

    def set(self, key: str, data: Any) -> None:
        p = self._path(key)
        write_json(p, data)


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
            timeout=6.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://lolalytics.com/",
                "Origin": "https://lolalytics.com",
            },
            follow_redirects=True,
        )
        self._cache = FileCache(config.cache_dir, ttl_seconds=config.cache_ttl_hours * 3600)
        self._ddragon_version: Optional[str] = None
        self._version_checked = 0.0
        self.last_errors = {}
        self.last_success = {}
        self._http_slots = asyncio.Semaphore(6)
        self._retry_after = {}

    async def _get(self, url, **kwargs):
        """GET with a per-source circuit breaker.

        Only outages trip the breaker (network errors, timeouts, 429, 5xx). A 4xx
        for one resource (a champion Lolalytics does not know yet) must not black
        out every other request to the same source.
        """
        source = "lolalytics" if url.startswith(self.LOLA) else "ddragon"
        async with self._http_slots:
            if self._retry_after.get(source, 0) > time.monotonic():
                raise RuntimeError("Source temporairement indisponible")
            try:
                response = await self._client.get(url, **kwargs)
                response.raise_for_status()
                self.last_errors.pop(source, None)
                self.last_success[source] = time.time()
                return response
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status == 429 or status >= 500:
                    self._retry_after[source] = time.monotonic() + 30
                    self.last_errors[source] = "Source indisponible ; nouvelle tentative différée"
                raise
            except (httpx.HTTPError, ValueError):
                self._retry_after[source] = time.monotonic() + 30
                self.last_errors[source] = "Source indisponible ; nouvelle tentative différée"
                raise

    async def close(self):
        await self._client.aclose()

    # ── Data Dragon ──────────────────────────────────────────────────────
    async def get_ddragon_version(self, force: bool = False) -> str:
        if not force and self._ddragon_version and time.monotonic() - self._version_checked < 3600:
            return self._ddragon_version
        url = f"{self.DDRAGON}/api/versions.json"
        cache_key = "ddragon_versions"
        cached = None if force else self._cache.get(cache_key)
        if cached:
            self._ddragon_version = cached[0]
            self._version_checked = time.monotonic()
            return self._ddragon_version
        try:
            resp = await self._get(url)
            versions = resp.json()
            if not isinstance(versions, list) or not versions:
                raise ValueError("Catalogue de versions vide")
            self._cache.set(cache_key, versions)
            self._ddragon_version = versions[0]
            self._version_checked = time.monotonic()
        except Exception as exc:
            self.last_errors["ddragon"] = "Source DDragon indisponible"
            logger.warning("Failed to fetch DDragon versions: %s", exc)
            if not self._ddragon_version:
                raise RuntimeError("Impossible de charger la version DDragon") from exc
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
            resp = await self._get(url)
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
    async def fetch_tierlist(self, role: str = "mid", patch: str = "current", tier: Optional[str] = None) -> Dict[str, Any]:
        """Fetch the tier list for a role at a Lolalytics tier. Returns {cid: {wr, pr, br, games, ...}}."""
        lane = role_to_lane(role)
        tier = tier or self.TIER
        if patch == "current":
            patch = await self.get_current_patch()

        cache_key = f"lola_list_{lane}_{patch}_{tier}_{self.QUEUE}_{self.REGION}"
        cached = self._cache.get(cache_key)
        if cached:
            self.last_success[f"meta:{role}"] = self._cache.collected_at(cache_key)
            return cached

        url = f"{self.LOLA}/mega/"
        params = {
            "ep": "list",
            "v": "1",
            "patch": patch,
            "lane": lane,
            "tier": tier,
            "queue": self.QUEUE,
            "region": self.REGION,
        }
        try:
            resp = await self._get(url, params=params)
            data = resp.json()
            self.last_success[f"meta:{role}"] = time.time()
            self.last_errors.pop(f"meta:{role}", None)
            self._cache.set(cache_key, data)
            return data
        except Exception as exc:
            self.last_errors[f"meta:{role}"] = "Méta indisponible"
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
        cache_key = f"lola_counter_{champion_slug}_{lane}{cache_suffix}_{patch}_{self.TIER}_{self.QUEUE}_{self.REGION}"
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
            resp = await self._get(url, params=params)
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
        cid_data = raw.get("cid", {}) if isinstance(raw, dict) else {}
        avg_wr = raw.get("avgWr", 50.0) if isinstance(raw, dict) else 50.

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
            try:
                wr, pr, br, games = float(wr), float(pr), float(br), int(games)
                average = float(avg_wr)
            except (ValueError, TypeError, OverflowError):
                continue
            if games <= 0 or not all(math.isfinite(v) for v in (wr, pr, br, average)) or not 0 < wr <= 100:
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
        if not isinstance(raw_counter_page, dict): return []
        counters = raw_counter_page.get("counters", [])
        stats = raw_counter_page.get("stats") or {}
        if not isinstance(counters, list) or not isinstance(stats, dict): return []
        try: our_wr = float(stats.get("wr", 50.))
        except (TypeError, ValueError): return []
        if not math.isfinite(our_wr) or not 0 <= our_wr <= 100: return []
        results = []
        for entry in counters:
            if not isinstance(entry, dict): continue
            try:
                cid, games = int(entry["cid"]), int(entry.get("n", 0))
                wr = float(entry.get("vsWr", 50.))
                d1 = float(entry.get("d1", wr - our_wr))
                d2 = float(entry.get("d2", d1))
                overall = float(entry.get("allWr", 50.))
            except (KeyError, TypeError, ValueError, OverflowError): continue
            if not 1 <= cid <= 10000 or games <= 0: continue
            if not all(math.isfinite(v) for v in (wr, d1, d2, overall)): continue
            if not 0 <= wr <= 100 or not 0 <= overall <= 100: continue
            results.append({"opponent_id": cid, "vs_win_rate": wr, "games": games,
                "delta": round(d1, 2), "delta_normalised": round(d2, 2),
                "opponent_overall_wr": overall,
                "opponent_default_lane": entry.get("defaultLane", ""), "our_wr": our_wr})
        return results

    # ── Champion slug helper ─────────────────────────────────────────────
    @staticmethod
    def key_to_slug(champion_key: str) -> str:
        """Convert Data Dragon key (e.g. 'AurelionSol') to Lolalytics slug ('aurelionsol')."""
        return champion_key.lower().replace("'", "").replace(" ", "")
