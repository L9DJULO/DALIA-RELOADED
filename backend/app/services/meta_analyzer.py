"""Meta analyzer — scores a champion based on current meta strength.

Score 0-100 derived from:
  • Win rate   (major component, centred on 50 %)
  • Pick rate  (popularity = meta relevance)
  • Ban rate   (banned often → perceived as strong)
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from app.config import config
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
        """Fetch + cache blended tier list for *role* so score() is synchronous.

        Blending strategy:
          • Fetch BOTH the current-patch tier list AND the 30-day tier list.
          • For each champion, compute a **game-count–weighted average** of
            WR / PR / BR  (prorata des games en Master+).
          • This ensures:
            – Early-patch (few games) → 30-day data dominates = stable stats
            – Mid-patch (many games)  → current patch pushes stats toward fresh meta
          • The game count stored = max(current, 30d) to avoid double-counting
            (the 30d window *includes* the current patch).
        """
        if role in self._loaded_roles:
            return

        # Fetch both data sources in parallel-ish fashion
        raw_current = await self.fetcher.fetch_tierlist(role=role, patch="current")
        raw_30d = await self.fetcher.fetch_tierlist(role=role, patch="30")

        entries_current = LolalyticsFetcher.parse_tierlist(raw_current)
        entries_30d = LolalyticsFetcher.parse_tierlist(raw_30d)

        # Index by champion_id for fast lookup
        cur_by_id = {e["champion_id"]: e for e in entries_current}
        t30_by_id = {e["champion_id"]: e for e in entries_30d}

        all_ids = set(cur_by_id.keys()) | set(t30_by_id.keys())

        for cid in all_ids:
            cur = cur_by_id.get(cid)
            t30 = t30_by_id.get(cid)

            if cur and t30:
                # Weighted average — prorata des games
                gc, g30 = cur["games"], t30["games"]
                total_w = gc + g30
                if total_w <= 0:
                    continue
                wr = (cur["win_rate"] * gc + t30["win_rate"] * g30) / total_w
                pr = (cur["pick_rate"] * gc + t30["pick_rate"] * g30) / total_w
                br = (cur["ban_rate"] * gc + t30["ban_rate"] * g30) / total_w
                # 30d includes current patch → don't double-count
                games = max(gc, g30)
            elif cur:
                wr, pr, br, games = cur["win_rate"], cur["pick_rate"], cur["ban_rate"], cur["games"]
            else:  # t30 only
                wr, pr, br, games = t30["win_rate"], t30["pick_rate"], t30["ban_rate"], t30["games"]

            stats = ChampionStats(
                champion_id=cid,
                role=role,
                win_rate=round(wr, 2),
                pick_rate=round(pr, 2),
                ban_rate=round(br, 2),
                games=games,
                patch="blended",
            )
            self.db.set_stats(stats)

        self._loaded_roles.add(role)
        logger.info(
            "Meta tier list loaded for %s — %d entries (blended current+30d)",
            role, len(all_ids),
        )

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
        raw = wr_score * 0.80 + pr_score * 0.15 + br_score * 0.05

        # ── Sample-size confidence multiplier ──
        # Champions with very few games have unreliable stats (e.g. Senna ADC
        # at 3 k games vs Kai'Sa at 100 k+).  We penalise low-data champions
        # so they don't get recommended over proven picks.
        games = stats.games
        min_rel = config.min_games_reliable       # 5 000
        full_conf = config.min_games_full_confidence  # 50 000
        if games < min_rel:
            # Very few games → heavy penalty (×0.35 – ×0.65)
            confidence = 0.35 + 0.30 * (games / min_rel)
        elif games < full_conf:
            # Moderate games → gentle ramp from 0.65 → 1.0
            ratio = (games - min_rel) / (full_conf - min_rel)
            confidence = 0.65 + 0.35 * ratio
        else:
            confidence = 1.0

        return round(_clamp(raw * confidence), 1)

    def games(self, champion_id: int, role: str) -> int:
        """Return number of games for a (champion, role).  0 if unknown."""
        stats = self.db.get_stats(champion_id, role)
        return stats.games if stats else 0

    # ── Bulk ─────────────────────────────────────────────────────────────
    async def scores_for_role(self, role: str) -> Dict[int, float]:
        """Load tier list and return {champion_id: meta_score} for a role."""
        await self.load_tierlist(role)
        result: Dict[int, float] = {}
        for champ in self.db.all_champions():
            result[champ.id] = self.score(champ.id, role)
        return result
