"""Meta analyzer — statistiques Lolalytics par (champion, rôle, tier).

Le terme méta du scoring lit `stats()` ; le score 0-100 historique reste
utilisé par le recommandeur de bans, l'impact des bans et le filtre wildcard.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Optional

from app.config import config
from app.models.champion import ChampionStats
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.meta")


def _clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, val))


class MetaAnalyzer:
    """Statistiques méta par (champion, rôle, tier) + score 0-100 historique pour bans/wildcards."""

    # A failed refresh keeps the previous sample and retries after this delay.
    FAILED_REFRESH_RETRY = 600

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        self._loaded_roles: set = set()          # (role, tier)
        self._loaded_at: Dict[tuple, float] = {}
        self._locks: Dict[tuple, asyncio.Lock] = {}
        self._by_tier: Dict[str, Dict[tuple, ChampionStats]] = {}
        self.rank_fallback: set = set()

    def _default_tier(self) -> str:
        return self.fetcher.TIER

    def _is_fresh(self, key: tuple) -> bool:
        return key in self._loaded_roles and time.time() - self._loaded_at.get(key, 0) < config.cache_ttl_hours * 3600

    # ── Pre-load tier list for a whole role ──────────────────────────────
    async def load_tierlist(self, role: str, tier: Optional[str] = None):
        """Une seule fenêtre observée par champion ; jamais de mélange d'échantillons."""
        tier = tier or self._default_tier()
        key = (role, tier)
        if self._is_fresh(key):
            return
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            if self._is_fresh(key):
                return  # another request refreshed the role while we waited
            await self._load_tierlist(role, tier)

    async def _load_tierlist(self, role: str, tier: str):
        raw_current, raw_30d = await asyncio.gather(
            self.fetcher.fetch_tierlist(role=role, patch="current", tier=tier),
            self.fetcher.fetch_tierlist(role=role, patch="30", tier=tier))
        current = {e["champion_id"]: e for e in LolalyticsFetcher.parse_tierlist(raw_current)}
        recent = {e["champion_id"]: e for e in LolalyticsFetcher.parse_tierlist(raw_30d)}
        all_ids = current.keys() | recent.keys()
        key = (role, tier)
        if not all_ids:
            if tier != self._default_tier():
                # Rang sans échantillon : on sert le tier par défaut et on le signale.
                await self.load_tierlist(role, self._default_tier())
                default_stats = self._by_tier.get(self._default_tier(), {})
                kept = {k: v for k, v in self._by_tier.get(tier, {}).items() if k[1] != role}
                kept.update({k: v for k, v in default_stats.items() if k[1] == role})
                self._by_tier[tier] = kept
                self.rank_fallback.add(tier)
                self._loaded_roles.add(key)
                self._loaded_at[key] = time.time() - config.cache_ttl_hours * 3600 + self.FAILED_REFRESH_RETRY
                return
            if key in self._loaded_roles:
                # Source unavailable: keep the previous sample rather than scoring
                # every champion as unknown, and retry sooner than the normal TTL.
                logger.warning("Meta refresh for %s returned nothing; keeping the previous sample", role)
                self._loaded_at[key] = time.time() - config.cache_ttl_hours * 3600 + self.FAILED_REFRESH_RETRY
            return
        bucket = self._by_tier.setdefault(tier, {})
        for k in [k for k in bucket if k[1] == role]:
            del bucket[k]
        is_default = tier == self._default_tier()
        if is_default:
            self.db.clear_role_stats(role)
        for cid in all_ids:
            cur = current.get(cid)
            use_current = cur and (cur["games"] >= config.min_games_reliable or cid not in recent)
            entry = cur if use_current else recent[cid]
            stats = ChampionStats(champion_id=cid, role=role, win_rate=entry["win_rate"], pick_rate=entry["pick_rate"],
                                  ban_rate=entry["ban_rate"], games=entry["games"],
                                  patch="current" if use_current else "30d")
            bucket[(cid, role)] = stats
            if is_default:
                self.db.set_stats(stats)
        self.rank_fallback.discard(tier)
        self._loaded_roles.add(key)
        self._loaded_at[key] = time.time()
        logger.info("Meta loaded for %s (%s): %d entries, one sample window per champion", role, tier, len(all_ids))

    def stats(self, champion_id: int, role: str, tier: Optional[str] = None) -> Optional[ChampionStats]:
        """Statistiques (WR, pick rate, échantillon) pour un tier donné, ou None."""
        tier = tier or self._default_tier()
        return self._by_tier.get(tier, {}).get((champion_id, role))

    def is_loaded(self, role: str, tier: Optional[str] = None) -> bool:
        return (role, tier or self._default_tier()) in self._loaded_roles

    # ── Score 0-100 historique : bans, impact des bans, filtre wildcard ──
    def score(self, champion_id: int, role: str) -> float:
        """Return 0-100 meta score on the default tier. Call load_tierlist() first."""
        stats = self.db.get_stats(champion_id, role)
        if stats is None:
            return 45.0  # slightly below average — unknown = cautious
        wr_score = _clamp((stats.win_rate - 45.0) / 10.0 * 100.0)
        pr_score = min(stats.pick_rate / 12.0 * 100.0, 100.0)
        br_score = min(stats.ban_rate / 30.0 * 100.0, 100.0)
        raw = wr_score * 0.80 + pr_score * 0.15 + br_score * 0.05
        games = stats.games
        min_rel = config.min_games_reliable
        full_conf = config.min_games_full_confidence
        if games < min_rel:
            confidence = 0.35 + 0.30 * (games / min_rel)
        elif games < full_conf:
            confidence = 0.65 + 0.35 * ((games - min_rel) / (full_conf - min_rel))
        else:
            confidence = 1.0
        return round(_clamp(raw * confidence), 1)

    def games(self, champion_id: int, role: str) -> int:
        """Return number of games for a (champion, role) on the default tier. 0 if unknown."""
        stats = self.db.get_stats(champion_id, role)
        return stats.games if stats else 0

    # ── Bulk ─────────────────────────────────────────────────────────────
    async def scores_for_role(self, role: str) -> Dict[int, float]:
        """Load tier list and return {champion_id: meta_score} for a role."""
        await self.load_tierlist(role)
        return {champ.id: self.score(champ.id, role) for champ in self.db.all_champions()}
