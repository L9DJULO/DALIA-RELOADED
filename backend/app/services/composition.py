"""Composition analyzer — evaluates team balance when adding a candidate champion.

Checks for:
  1. Damage distribution (AD / AP / Mixed) — avoid mono-damage
  2. Frontline / tank presence
  3. Crowd-control density
  4. Engage / initiation
  5. Poke capability
  6. Sustained DPS presence (carry threat)
  7. Utility coverage
  8. Split-push option

Score 0-100 starts at 100 (perfect) and deductions are applied for imbalances.
"""
from __future__ import annotations

import logging
from typing import Dict, List

from app.models.champion import Champion
from app.models.draft import CompositionWarning, DraftState
from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.composition")


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


class CompositionAnalyzer:
    """Score how well a candidate champion balances the team composition."""

    def __init__(self, champion_db: ChampionDatabase):
        self.db = champion_db

    def _resolve_team(self, draft: DraftState, candidate: Champion) -> List[Champion]:
        """Build the team list:  existing allies + candidate."""
        team: List[Champion] = []
        for ap in draft.ally_picks:
            if ap.champion_id is not None:
                c = self.db.get_by_id(ap.champion_id)
                if c:
                    team.append(c)
        team.append(candidate)
        return team

    def score(self, candidate: Champion, draft: DraftState) -> float:
        """Return 0-100 composition score."""
        team = self._resolve_team(draft, candidate)

        if len(team) <= 1:
            return 60.0  # not enough info for real analysis

        score = 82.0  # start at 82 — a perfect comp earns up to 95
        warnings = self._warnings(team)
        for w in warnings:
            if w.severity == "critical":
                score -= 22
            else:
                score -= 13

        # ── Context-aware penalties ──
        has_immobile_carry = any(
            "Marksman" in c.tags and c.ratings.tankiness <= 2 for c in team
        )
        has_peel = any(
            c.ratings.utility >= 4
            or (c.ratings.cc >= 4 and c.ratings.tankiness >= 3)
            for c in team
        )
        has_tank = any(c.ratings.tankiness >= 4 for c in team)

        if has_immobile_carry and not has_peel and len(team) >= 3:
            score -= 10  # carry with no peel = exploitable
        if has_immobile_carry and not has_tank and len(team) >= 3:
            score -= 8   # carry with no frontline = extremely vulnerable

        # ── Bonus for well-rounded comp ──
        if len(warnings) == 0 and len(team) >= 4:
            score += 10  # bonus for clean comp

        return round(_clamp(score, 8.0, 95.0), 1)

    def warnings(self, candidate: Champion, draft: DraftState) -> List[CompositionWarning]:
        """Generate composition warnings for the UI."""
        team = self._resolve_team(draft, candidate)
        return self._warnings(team)

    # ── Internal checks ──────────────────────────────────────────────────
    def _warnings(self, team: List[Champion]) -> List[CompositionWarning]:
        warns: List[CompositionWarning] = []
        n = len(team)
        if n < 2:
            return warns

        # ── 1. Damage distribution ───────────────────────────────────────
        total_phys = sum(c.damage.physical for c in team) / n
        total_mag  = sum(c.damage.magical for c in team) / n
        ad_ratio = total_phys / (total_phys + total_mag + 0.01)

        if ad_ratio > 0.78:
            warns.append(CompositionWarning(
                severity="critical",
                message=f"Comp trop AD ({ad_ratio*100:.0f}% physique) — l'ennemi peut stacker armure.",
            ))
        elif ad_ratio > 0.68:
            warns.append(CompositionWarning(
                severity="warning",
                message=f"Comp à tendance AD ({ad_ratio*100:.0f}% physique) — attention à l'équilibre de dégâts.",
            ))
        elif ad_ratio < 0.22:
            warns.append(CompositionWarning(
                severity="critical",
                message=f"Comp trop AP ({(1-ad_ratio)*100:.0f}% magique) — l'ennemi peut stacker MR.",
            ))
        elif ad_ratio < 0.32:
            warns.append(CompositionWarning(
                severity="warning",
                message=f"Comp à tendance AP ({(1-ad_ratio)*100:.0f}% magique) — attention à l'équilibre.",
            ))

        # ── 2. Frontline / Tank ──────────────────────────────────────────
        tanks = sum(1 for c in team if c.ratings.tankiness >= 4)
        frontline = sum(1 for c in team if c.ratings.tankiness >= 3)

        if n >= 3 and tanks == 0 and frontline <= 1:
            warns.append(CompositionWarning(
                severity="warning",
                message="Pas de vrai tank/frontlane — l'équipe manque de résistance.",
            ))

        # ── 3. CC ────────────────────────────────────────────────────────
        total_cc = sum(c.ratings.cc for c in team)
        if n >= 3 and total_cc / n < 2.0:
            warns.append(CompositionWarning(
                severity="warning",
                message="Peu de CC dans la compo — difficile de contrôler les teamfights.",
            ))

        # ── 4. Engage ────────────────────────────────────────────────────
        has_engage = any(c.ratings.engage >= 4 for c in team)
        if n >= 3 and not has_engage:
            warns.append(CompositionWarning(
                severity="warning",
                message="Pas d'engage fiable — il sera difficile de forcer les combats.",
            ))

        # ── 5. Carry threat / DPS ────────────────────────────────────────
        carries = sum(1 for c in team if c.ratings.dps >= 4 or c.ratings.burst >= 4)
        if n >= 4 and carries < 1:
            warns.append(CompositionWarning(
                severity="warning",
                message="Manque de menace offensive (carry) — pas assez de dégâts en late.",
            ))

        # ── 6. Trop de carries, pas assez de support ─────────────────────
        if n >= 4 and carries >= 4:
            warns.append(CompositionWarning(
                severity="warning",
                message="Trop de carries — pas assez de peel/utility pour les protéger.",
            ))

        return warns

    # Role-based damage weight: carries contribute more than supports
    _ROLE_DAMAGE_WEIGHT = {
        "top": 1.0, "jungle": 1.0, "mid": 1.2, "bot": 1.2, "support": 0.4,
    }

    def team_summary(self, candidate: Champion, draft: DraftState, candidate_role: str = "") -> Dict[str, float]:
        """Return a breakdown of team attributes for the UI.

        Damage values are *weighted* totals so that supports don't skew
        the AD/AP distribution as much as carries.
        """
        team = self._resolve_team(draft, candidate)
        n = max(len(team), 1)

        # Build (champion, role) pairs for weighted damage calculation
        ally_roles = {ap.champion_id: ap.role for ap in draft.ally_picks if ap.champion_id}
        champ_roles = []
        for c in team:
            role = ally_roles.get(c.id, "") or ""
            if c.id == candidate.id and candidate_role:
                role = candidate_role
            champ_roles.append((c, role))

        # Weighted damage distribution
        total_w = 0.0
        w_phys = 0.0
        w_mag = 0.0
        w_true = 0.0
        for c, role in champ_roles:
            w = self._ROLE_DAMAGE_WEIGHT.get(role, 1.0)
            total_w += w
            w_phys += c.damage.physical * w
            w_mag += c.damage.magical * w
            w_true += c.damage.true_dmg * w
        if total_w > 0:
            w_phys /= total_w
            w_mag /= total_w
            w_true /= total_w

        return {
            "damage_physical": round(w_phys, 1),
            "damage_magical": round(w_mag, 1),
            "damage_true": round(w_true, 1),
            "team_size": n,
            "cc": round(sum(c.ratings.cc for c in team) / n, 1),
            "engage": round(sum(c.ratings.engage for c in team) / n, 1),
            "poke": round(sum(c.ratings.poke for c in team) / n, 1),
            "splitpush": round(sum(c.ratings.splitpush for c in team) / n, 1),
            "teamfight": round(sum(c.ratings.teamfight for c in team) / n, 1),
            "utility": round(sum(c.ratings.utility for c in team) / n, 1),
            "tankiness": round(sum(c.ratings.tankiness for c in team) / n, 1),
            "burst": round(sum(c.ratings.burst for c in team) / n, 1),
            "dps": round(sum(c.ratings.dps for c in team) / n, 1),
        }
