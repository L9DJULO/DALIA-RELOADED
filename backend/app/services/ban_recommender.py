"""Ban recommendation engine — suggests optimal bans based on draft context.

Considers:
  • Champion pool vulnerabilities (what counters your pool?)
  • Meta strength (high WR/PR champions in the enemy's likely roles)
  • High ban rate champions (what the community bans)
  • Enemy role coverage (banning strong champs in roles you face)
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from app.models.champion import Champion
from app.models.draft import DraftState, PoolEntry
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher
from app.services.matchup import MatchupAnalyzer
from app.services.meta_analyzer import MetaAnalyzer

logger = logging.getLogger("dalia.bans")

ROLES = ["top", "jungle", "mid", "bot", "support"]

# Opposite roles — what role most threatens each position
THREAT_ROLES = {
    "top": ["top", "jungle"],
    "jungle": ["jungle", "mid"],
    "mid": ["mid", "jungle", "support"],
    "bot": ["bot", "support", "jungle"],
    "support": ["support", "bot", "jungle"],
}


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class BanRecommender:
    """Produces ranked ban suggestions based on pool, meta, and draft context."""

    def __init__(
        self,
        champion_db: ChampionDatabase,
        fetcher: LolalyticsFetcher,
        matchup_analyzer: MatchupAnalyzer,
        meta_analyzer: MetaAnalyzer,
    ):
        self.db = champion_db
        self.fetcher = fetcher
        self.matchup = matchup_analyzer
        self.meta = meta_analyzer

    async def recommend_bans(
        self,
        my_role: str,
        champion_pool: Dict[str, List[PoolEntry]],
        already_banned: List[int] = None,
        already_picked: List[int] = None,
        n: int = 10,
    ) -> List[Dict]:
        """Return top N ban suggestions with reasons.

        Args:
            my_role: The user's assigned role.
            champion_pool: Full champion pool (all roles).
            already_banned: Champion IDs already banned.
            already_picked: Champion IDs already picked.
            n: Number of suggestions to return.

        Returns:
            List of dicts with champion info, ban_score, and reasons.
        """
        if already_banned is None:
            already_banned = []
        if already_picked is None:
            already_picked = []

        unavailable = set(already_banned) | set(already_picked)

        # Load meta for threatening roles
        threat_roles = THREAT_ROLES.get(my_role, [my_role])
        for role in threat_roles:
            await self.meta.load_tierlist(role)

        # Get pool entries for the user's main role
        pool_entries = champion_pool.get(my_role, [])
        pool_ids = {pe.champion_id for pe in pool_entries}

        # ──────────────────────────────────────────────────
        # Score every eligible champion as a potential ban
        # ──────────────────────────────────────────────────
        ban_scores: Dict[int, Dict] = {}
        all_champs = self.db.all_champions()

        for champ in all_champs:
            if champ.id in unavailable:
                continue

            score = 0.0
            reasons = []

            # ─── 1. Counter threat to pool (40% weight) ───
            counter_score = await self._pool_counter_threat(champ, my_role, pool_entries)
            if counter_score > 0:
                score += counter_score * 0.40
                if counter_score >= 60:
                    reasons.append(f"Contre fort votre pool {my_role}")
                elif counter_score >= 30:
                    reasons.append(f"Contre modéré votre pool")

            # ─── 2. Meta strength in threatening roles (30%) ───
            meta_score = 0.0
            meta_role = ""
            for role in threat_roles:
                ms = self.meta.score(champ.id, role)
                if ms > meta_score:
                    meta_score = ms
                    meta_role = role

            if meta_score > 0:
                score += meta_score * 0.30
                if meta_score >= 70:
                    reasons.append(f"Meta S-tier en {meta_role}")
                elif meta_score >= 55:
                    reasons.append(f"Meta forte en {meta_role}")

            # ─── 3. Community ban rate (15%) ───
            ban_rate_score = 0.0
            for role in threat_roles:
                stats = self.db.get_stats(champ.id, role)
                if stats and stats.ban_rate > 0:
                    br_s = min(stats.ban_rate * 4, 100)  # 25% BR → 100 score
                    if br_s > ban_rate_score:
                        ban_rate_score = br_s

            if ban_rate_score > 0:
                score += ban_rate_score * 0.15
                if ban_rate_score >= 60:
                    reasons.append("Très fréquemment banni")

            # ─── 4. Archetype danger (15%) ───
            archetype_score = self._archetype_danger(champ, my_role, pool_entries)
            if archetype_score > 0:
                score += archetype_score * 0.15
                if archetype_score >= 50:
                    reasons.append("Archétype dangereux pour votre comp")

            # Only include if meaningful score
            if score >= 10:
                ban_scores[champ.id] = {
                    "champion_id": champ.id,
                    "champion_key": champ.key,
                    "champion_name": champ.name,
                    "image_url": champ.image_url,
                    "ban_score": round(_clamp(score), 1),
                    "reasons": reasons[:3],
                    "meta_role": meta_role,
                    "counter_threat": round(counter_score, 1) if counter_score > 0 else 0,
                    "meta_strength": round(meta_score, 1),
                }

        # Sort by ban score and return top N
        sorted_bans = sorted(ban_scores.values(), key=lambda x: -x["ban_score"])
        return sorted_bans[:n]

    async def _pool_counter_threat(
        self,
        threat_champ: Champion,
        my_role: str,
        pool_entries: List[PoolEntry],
    ) -> float:
        """How dangerous is this champion as a counter to the user's pool?

        Checks each pool champion's counter list and scores how often
        the threat champion appears as a strong counter.
        """
        if not pool_entries:
            return 0.0

        danger_total = 0.0
        pool_count = 0

        for entry in pool_entries[:8]:  # cap to avoid excessive API calls
            counters = self.matchup.get_top_counters(entry.champion_id, my_role, n=15)
            for opp_id, delta in counters:
                if opp_id == threat_champ.id and delta < -1.0:
                    # delta is negative = bad for pool champ
                    danger = min(abs(delta) * 15, 100)
                    danger_total += danger
                    pool_count += 1
                    break

        if pool_count == 0:
            return 0.0

        # Average danger weighted by how many pool champs are affected
        avg_danger = danger_total / len(pool_entries)
        # Bonus for affecting multiple pool champs
        multi_bonus = min(pool_count * 10, 40)

        return _clamp(avg_danger + multi_bonus)

    def _archetype_danger(
        self,
        champ: Champion,
        my_role: str,
        pool_entries: List[PoolEntry],
    ) -> float:
        """Score based on how dangerous the champion's archetype is.

        Assassin junglers vs ADC pool, engage supports vs immobile mages, etc.
        """
        score = 0.0
        tags = set(champ.tags)

        # Check pool champion archetypes
        pool_champs = [self.db.get_by_id(pe.champion_id) for pe in pool_entries]
        pool_champs = [c for c in pool_champs if c]

        pool_is_squishy = any(c.ratings.tankiness <= 2 for c in pool_champs)
        pool_is_immobile = any(
            "Marksman" in c.tags or ("Mage" in c.tags and c.ratings.tankiness <= 2)
            for c in pool_champs
        )

        # Assassin threats
        if "Assassin" in tags and pool_is_squishy:
            score += 50
            if pool_is_immobile:
                score += 20

        # Heavy engage threats
        if champ.ratings.engage >= 4 and pool_is_immobile:
            score += 35

        # Strong gankers vs bot lane
        if my_role in ("bot", "support") and champ.ratings.engage >= 3:
            if "Fighter" in tags or "Assassin" in tags:
                score += 25

        return _clamp(score)
