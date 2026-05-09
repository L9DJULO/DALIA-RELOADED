"""Matchup analyzer — how well does champion X fare against enemy picks?

Score 0-100:
  • 50 = neutral (no enemies revealed yet, or average matchup)
  • >50 = favourable (we beat the enemy / lane opponent)
  • <50 = unfavourable (countered)

Lane opponent is weighted 3× more than off-role enemies.
When API data is missing, uses champion-attribute-based threat estimation.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from app.models.draft import DraftPick, DraftState
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.matchup")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class MatchupAnalyzer:
    """Compute matchup sub-scores using Lolalytics counter data + heuristic fallback.

    Now fetches CROSS-LANE matchup data: when Nilah (bot) faces
    Warwick (top), we query vslane=top to get the real matchup.
    Uses d2 (normalised delta) which accounts for both champion strengths.
    """

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher
        # cache: (champ_id, role, vs_lane) → {opp_id: (vs_wr, games, d1, d2)}
        self._matchup_cache: Dict[Tuple, Dict[int, Tuple[float, int, float, float]]] = {}

    # ── Pre-load matchup data for a champion ─────────────────────────────
    async def load_matchups(self, champion_id: int, role: str, vs_lane: Optional[str] = None):
        """Fetch and cache matchup data for a (champion, role) vs a specific lane.

        Args:
            vs_lane: if set, fetches cross-lane data (e.g. bot vs top).
                     if None, fetches same-lane data (default).
        """
        cache_key = (champion_id, role, vs_lane)
        if cache_key in self._matchup_cache:
            return

        champ = self.db.get_by_id(champion_id)
        if not champ:
            return

        slug = LolalyticsFetcher.key_to_slug(champ.key)
        raw = await self.fetcher.fetch_counter_page(slug, role, vs_lane=vs_lane)
        counters = LolalyticsFetcher.parse_counters(raw)

        result: Dict[int, Tuple[float, int, float, float]] = {}
        for c in counters:
            opp_id = c["opponent_id"]
            vs_wr = c["vs_win_rate"]
            games = c["games"]
            d1 = c["delta"]
            d2 = c["delta_normalised"]
            result[opp_id] = (vs_wr, games, d1, d2)

        self._matchup_cache[cache_key] = result
        lane_desc = f"{role} vs {vs_lane}" if vs_lane else role
        logger.debug("Loaded %d matchups for %s (%s)", len(result), champ.name, lane_desc)

    async def _get_matchup_data(
        self, champion_id: int, role: str, opp_id: int, opp_role: Optional[str]
    ) -> Optional[Tuple[float, int, float, float]]:
        """Get matchup data for a specific opponent, trying cross-lane if needed."""
        # 1. Try same-lane cache first
        same_lane_key = (champion_id, role, None)
        if same_lane_key in self._matchup_cache:
            data = self._matchup_cache[same_lane_key]
            if opp_id in data:
                return data[opp_id]

        # 2. Try cross-lane if opponent is in a different role
        if opp_role and opp_role != role:
            cross_lane_key = (champion_id, role, opp_role)
            if cross_lane_key not in self._matchup_cache:
                await self.load_matchups(champion_id, role, vs_lane=opp_role)
            data = self._matchup_cache.get(cross_lane_key, {})
            if opp_id in data:
                return data[opp_id]

        return None

    # ── Attribute-based fallback when API data missing ────────────────────
    def _estimate_matchup(
        self, candidate_id: int, opponent_id: int, is_lane: bool
    ) -> Tuple[float, int]:
        """Heuristic matchup when no counter data exists.

        Returns (mu_score, pseudo_games=0).
        The estimate is intentionally pessimistic — unknown = cautious.
        """
        cand = self.db.get_by_id(candidate_id)
        opp = self.db.get_by_id(opponent_id)
        if not cand or not opp:
            return 42.0, 0  # pessimistic if we know nothing

        score = 46.0  # slightly below neutral — unknown matchups should be scary
        c_tags = set(cand.tags)
        o_tags = set(opp.tags)

        if is_lane:
            # ── Direct lane interaction ──
            # Assassin / burst mage vs immobile carry = terrible
            if ("Assassin" in o_tags or opp.ratings.burst >= 4) and "Marksman" in c_tags:
                score -= 14
            # Fighter / bruiser vs squishy in lane
            elif "Fighter" in o_tags and cand.ratings.tankiness <= 2:
                score -= 10
            # High engage vs no-escape carry (e.g. Leona vs immobile ADC)
            elif opp.ratings.engage >= 4 and cand.ratings.tankiness <= 2 and "Marksman" in c_tags:
                score -= 11
            # Tank vs DPS — boring lane but carry scales, slight early disadvantage
            elif "Tank" in o_tags and cand.ratings.dps >= 4:
                score -= 2
            # Poke mage vs melee → slightly good for poke
            elif "Mage" in o_tags and cand.ratings.poke >= 4:
                score += 3
        else:
            # ── Off-lane threat: roam / gank / teamfight pressure ──
            # Burst assassin threatens immobile carry
            if opp.ratings.burst >= 4 and cand.ratings.tankiness <= 2:
                score -= 7
            # Heavy engage threatens carries (Vi ult, Malphite ult …)
            if opp.ratings.engage >= 4 and cand.ratings.tankiness <= 2:
                score -= 5
            # Assassin jg/mid vs ADC
            if "Assassin" in o_tags and "Marksman" in c_tags:
                score -= 6
            # Tanks / supports off-lane → lower direct threat
            if "Support" in o_tags or ("Tank" in o_tags and opp.ratings.burst <= 2):
                score += 3

        # Clamp: never assume great matchup without data, never go below 15
        return round(_clamp(score, 15.0, 58.0), 1), 0

    # ── Score ────────────────────────────────────────────────────────────
    async def score(self, champion_id: int, role: str, draft: DraftState) -> float:
        """Return 0-100 matchup score given current draft state.

        For each enemy, the matchup score is computed as an expectation over
        the enemy's inferred role distribution (draft.role_distributions):
            mu_score(enemy) = Σ_r P(enemy in r) × mu_score_at_role(r)

        The "is_lane" weight (3× vs 1×) is similarly an expectation:
            weight(enemy) = 3.0 × P(enemy in my role) + 1.0 × P(enemy elsewhere)

        This makes flex picks like Naafiri (jgl 0.62 / mid 0.38) contribute
        partially to the lane matchup instead of being deterministically
        labelled jungle and ignored, or labelled mid and overrated.
        """
        if not draft.enemy_picks:
            return 50.0  # no information

        # Pre-load same-lane matchups
        await self.load_matchups(champion_id, role)

        weighted_scores: List[Tuple[float, float]] = []

        for ep in draft.enemy_picks:
            if ep.champion_id is None:
                continue
            opp_id = ep.champion_id

            dist = draft.role_distributions.get(opp_id) if draft.role_distributions else None
            if not dist:
                # No distribution → fall back to the pinned role (or argmax-equivalent)
                dist = {ep.role: 1.0} if ep.role else {}

            # Empty distribution (truly unknown) — single neutral data point
            if not dist:
                weighted_scores.append((50.0, 1.0))
                continue

            # Expected matchup score and expected lane-weight
            expected_score = 0.0
            expected_weight = 0.0
            for opp_role, p in dist.items():
                if p <= 0:
                    continue
                is_lane = opp_role == role
                mu_data = await self._get_matchup_data(champion_id, role, opp_id, opp_role)
                if mu_data is not None:
                    _, games, _, d2 = mu_data
                    mu_score = 50.0 + d2 * 7.0
                    if games < 30:
                        mu_score = mu_score * 0.6 + 50.0 * 0.4
                else:
                    mu_score, _ = self._estimate_matchup(champion_id, opp_id, is_lane)
                expected_score += p * _clamp(mu_score, 10.0, 90.0)
                expected_weight += p * (3.0 if is_lane else 1.0)

            if expected_weight > 0:
                weighted_scores.append((expected_score, expected_weight))

        if not weighted_scores:
            return 50.0

        total_w = sum(w for _, w in weighted_scores)
        avg = sum(s * w for s, w in weighted_scores) / total_w
        return round(_clamp(avg), 1)

    # ── Details for UI ───────────────────────────────────────────────────
    async def details(self, champion_id: int, role: str, draft: DraftState) -> List[Dict]:
        """Return per-enemy matchup breakdown.

        Uses the most-likely role from draft.role_distributions when
        available so the per-row delta reflects the dominant scenario, but
        also surfaces the lane-probability so reasons.py can soften
        "Lane favorable" wording for ambiguous flex picks.
        """
        await self.load_matchups(champion_id, role)
        details = []
        for ep in draft.enemy_picks:
            if ep.champion_id is None:
                continue
            opp = self.db.get_by_id(ep.champion_id)
            opp_name = opp.name if opp else str(ep.champion_id)

            dist = draft.role_distributions.get(ep.champion_id) if draft.role_distributions else None
            lane_prob = dist.get(role, 0.0) if dist else (1.0 if ep.role == role else 0.0)
            # Display role = argmax of distribution (or pinned role)
            if dist:
                display_role = max(dist.items(), key=lambda x: x[1])[0]
            else:
                display_role = ep.role or "?"
            is_lane = display_role == role

            mu_data = await self._get_matchup_data(champion_id, role, ep.champion_id, display_role)

            if mu_data is not None:
                vs_wr, games, d1, d2 = mu_data
                delta = d2  # use normalised delta for display
            else:
                est_score, _ = self._estimate_matchup(champion_id, ep.champion_id, is_lane)
                vs_wr = est_score
                games = 0
                delta = round(est_score - 50.0, 1)

            details.append({
                "opponent_name": opp_name,
                "opponent_role": display_role,
                "win_rate": vs_wr,
                "delta": delta,
                "is_lane_opponent": is_lane,
                "games": games,
                "lane_probability": round(lane_prob, 2),
                "role_distribution": {r: round(p, 2) for r, p in (dist or {}).items()},
            })
        return details

    # ── Counter detection ────────────────────────────────────────────────
    def get_top_counters(self, champion_id: int, role: str, n: int = 10) -> List[Tuple[int, float]]:
        """Return worst matchups (lowest deltas). Used for draft-risk scoring."""
        data = self._matchup_cache.get((champion_id, role, None), {})
        if not data:
            return []
        sorted_m = sorted(data.items(), key=lambda x: x[1][3])  # by d2 normalised ascending
        return [(opp_id, info[3]) for opp_id, info in sorted_m[:n]]
