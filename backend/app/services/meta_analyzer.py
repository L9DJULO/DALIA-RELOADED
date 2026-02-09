"""Meta analyzer — scores a champion based on current meta strength.

Score 0-100 derived from:
  • Win rate   (major component, centred on 50 %)
  • Pick rate  (popularity = meta relevance)
  • Ban rate   (banned often → perceived as strong)
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from app.models.champion import ChampionStats
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.meta")


def _clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, val))


class MetaAnalyzer:
    """Compute a 0-100 meta score for each (champion, role) tuple."""

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        self._loaded_roles: set = set()

    # ── Pre-load tier list for a whole role ──────────────────────────────
    async def load_tierlist(self, role: str):
        """Fetch + cache tier list for *role* so score() is synchronous."""
        if role in self._loaded_roles:
            return

        raw = await self.fetcher.fetch_tierlist(role=role)
        entries = LolalyticsFetcher.parse_tierlist(raw)

        for e in entries:
            cid = e["champion_id"]
            stats = ChampionStats(
                champion_id=cid,
                role=role,
                win_rate=e.get("win_rate", 50.0),
                pick_rate=e.get("pick_rate", 0.0),
                ban_rate=e.get("ban_rate", 0.0),
                games=e.get("games", 0),
                patch=str(e.get("patch", "")),
            )
            self.db.set_stats(stats)

        self._loaded_roles.add(role)
        logger.info("Meta tier list loaded for %s — %d entries", role, len(entries))

    # ── Score ────────────────────────────────────────────────────────────
    def score(self, champion_id: int, role: str) -> float:
        """Return 0-100 meta score.  Call load_tierlist() first."""
        stats = self.db.get_stats(champion_id, role)
        if stats is None:
            return 45.0  # slightly below average — unknown = cautious

        # Win rate component:  45 % → 0,  50 % → 50,  55 % → 100
        wr_score = (stats.win_rate - 45.0) / 10.0 * 100.0
        wr_score = _clamp(wr_score)

        # Pick rate component: log-ish scale, 10 % pick rate ≈ very popular
        pr_score = min(stats.pick_rate / 12.0 * 100.0, 100.0)

        # Ban rate component: high ban → feared → strong
        br_score = min(stats.ban_rate / 30.0 * 100.0, 100.0)

        # Weighted combination — WR is the primary meta indicator
        # 52.63% WR = genuinely strong regardless of pick/ban popularity
        return round(_clamp(wr_score * 0.80 + pr_score * 0.15 + br_score * 0.05), 1)

    # ── Bulk ─────────────────────────────────────────────────────────────
    async def scores_for_role(self, role: str) -> Dict[int, float]:
        """Load tier list and return {champion_id: meta_score} for a role."""
        await self.load_tierlist(role)
        result: Dict[int, float] = {}
        for champ in self.db.all_champions():
            result[champ.id] = self.score(champ.id, role)
        return result
