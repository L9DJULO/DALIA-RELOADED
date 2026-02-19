"""Synergy analyzer — how well does champion X synergize with allied picks?

Score 0-100:
  • 50 = neutral (no allies revealed or unknown synergy)
  • >50 = good synergy (complementary playstyles)
  • <50 = negative synergy (conflicting needs)

Computed from champion attributes rather than win-rate data, since
the Lolalytics synergy API endpoint is not publicly accessible.

Factors:
  1. Damage type diversity (bonus for mixed AD/AP)
  2. CC chain potential (multiple CC sources)
  3. Engage + follow-up (engage + burst/dps)
  4. Frontline + backline balance
  5. Utility coverage
  6. Win condition alignment (teamfight vs splitpush)
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from app.models.draft import DraftPick, DraftState
from app.services.champion_data import ChampionDatabase
from app.services.data_fetcher import LolalyticsFetcher

logger = logging.getLogger("dalia.synergy")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class SynergyAnalyzer:
    """Compute synergy sub-scores from champion attributes."""

    def __init__(self, champion_db: ChampionDatabase, fetcher: LolalyticsFetcher):
        self.db = champion_db
        self.fetcher = fetcher

    async def score(self, champion_id: int, role: str, draft: DraftState) -> float:
        """Return 0-100 synergy score based on how well the candidate
        complements existing allied picks."""
        allies = []
        for ap in draft.ally_picks:
            if ap.champion_id is not None:
                c = self.db.get_by_id(ap.champion_id)
                if c:
                    allies.append((c, ap.role))

        if not allies:
            return 50.0  # no allies → neutral

        candidate = self.db.get_by_id(champion_id)
        if not candidate:
            return 50.0

        team_champs = [a[0] for a in allies] + [candidate]
        score = 50.0  # start neutral

        # 1. Damage diversity bonus (AD + AP mix is good)
        avg_phys = sum(c.damage.physical for c in team_champs) / len(team_champs)
        avg_mag = sum(c.damage.magical for c in team_champs) / len(team_champs)
        ratio = avg_phys / (avg_phys + avg_mag + 0.01)
        balance_distance = abs(ratio - 0.50)
        if balance_distance < 0.10:
            score += 6
        elif balance_distance < 0.20:
            score += 2
        elif balance_distance > 0.30:
            score -= 6

        # 2. CC chain potential
        cc_total = sum(c.ratings.cc for c in team_champs)
        if cc_total >= 15:
            score += 6
        elif cc_total >= 10:
            score += 2
        elif cc_total < 6:
            score -= 4

        # 3. Engage + follow-up synergy
        has_engage = any(c.ratings.engage >= 4 for c, _ in allies)
        candidate_dps = candidate.ratings.dps >= 4 or candidate.ratings.burst >= 4
        if has_engage and candidate_dps:
            score += 5

        # 4. ADC + Support specific synergy (huge impact)
        is_adc = "Marksman" in candidate.tags or (role == "bot" and candidate.ratings.dps >= 4)
        support_ally = next(((c, r) for c, r in allies if r == "support"), None)
        if is_adc and support_ally:
            support_champ = support_ally[0]
            # Engage supports with ADC = great
            if support_champ.ratings.engage >= 4:
                score += 8
            # Enchanters with ADC = great
            if support_champ.ratings.utility >= 4:
                score += 7
            # Tank support = good
            if support_champ.ratings.tankiness >= 4:
                score += 5
            # Mage supports provide poke
            if "Mage" in support_champ.tags and support_champ.ratings.poke >= 3:
                score += 3

        # 5. Melee carry (Nilah, Yasuo ADC) needs extra peel
        is_melee_carry = is_adc and candidate.ratings.tankiness <= 2 and candidate.damage.physical >= 60
        if is_melee_carry:
            has_peel = any(c.ratings.utility >= 4 or (c.ratings.cc >= 4 and c.ratings.tankiness >= 3) for c, _ in allies)
            if has_peel:
                score += 6  # melee carry + peel = great
            else:
                score -= 8  # melee carry without peel = terrible

        # 6. Frontline/backline balance
        tanks = sum(1 for c in team_champs if c.ratings.tankiness >= 4)
        carries = sum(1 for c in team_champs if c.ratings.dps >= 4 or c.ratings.burst >= 4)
        if tanks >= 1 and carries >= 1:
            score += 3
        elif tanks == 0 and candidate.ratings.tankiness < 3:
            score -= 4

        # 7. AoE combo synergy (Nilah/Yasuo + Rumble/Ori/Seraphine)
        aoe_score = sum(c.ratings.teamfight for c in team_champs) / len(team_champs)
        if aoe_score >= 4.0:
            score += 4

        return round(_clamp(score), 1)

    async def details(self, champion_id: int, role: str, draft: DraftState) -> List[Dict]:
        """Per-ally synergy detail for UI — based on attribute complementarity."""
        candidate = self.db.get_by_id(champion_id)
        if not candidate:
            return []

        is_adc = "Marksman" in candidate.tags or (role == "bot" and candidate.ratings.dps >= 4)
        result = []
        for ap in draft.ally_picks:
            if ap.champion_id is None:
                continue
            ally = self.db.get_by_id(ap.champion_id)
            if not ally:
                continue
            ally_name = ally.name

            # Compute a pairwise synergy delta
            delta = 0.0

            # ADC + Support synergy (most important)
            if is_adc and ap.role == "support":
                if ally.ratings.engage >= 4:
                    delta += 5.0  # engage support with ADC
                if ally.ratings.utility >= 4:
                    delta += 4.5  # enchanter with ADC
                if ally.ratings.tankiness >= 4:
                    delta += 3.0  # tank support
                if ally.ratings.cc >= 4:
                    delta += 2.0  # CC support
                if "Mage" in ally.tags and ally.ratings.poke >= 3:
                    delta += 1.5  # poke mage support

            # Damage diversity
            phys_mix = abs(candidate.damage.physical - ally.damage.physical)
            if phys_mix > 30:
                delta += 1.0

            # CC chain
            if candidate.ratings.cc >= 3 and ally.ratings.cc >= 3:
                delta += 1.5

            # Engage + follow up
            if ally.ratings.engage >= 4 and (candidate.ratings.burst >= 4 or candidate.ratings.dps >= 4):
                delta += 2.5
            elif candidate.ratings.engage >= 4 and (ally.ratings.burst >= 4 or ally.ratings.dps >= 4):
                delta += 2.5

            # Tank + carry
            if ally.ratings.tankiness >= 4 and candidate.ratings.dps >= 4:
                delta += 2.0

            # Both squishy assassins/mages → slight negative
            if candidate.ratings.tankiness <= 2 and ally.ratings.tankiness <= 2:
                delta -= 1.5

            result.append({
                "ally_name": ally_name,
                "ally_role": ap.role or "?",
                "delta": round(delta, 1),
            })
        return result
