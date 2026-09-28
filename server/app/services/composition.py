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

Le score 0-100 a disparu : le terme composition marginale (app.scoring.composition_term)
utilise `team_warnings` et la couverture d'outils.
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

    def team_warnings(self, team: List[Champion]) -> List[CompositionWarning]:
        """Avertissements de composition pour une équipe donnée (sans candidat implicite)."""
        return self._warnings(team)

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

        # ── 1. Sources de dégâts ─────────────────────────────────────────
        # « Trop AD, c'est une seule vraie source AP » (joueur, 28/09). À cinq :
        # aucune source d'un type est critique, une seule est un avertissement.
        # À quatre, le dernier pick peut encore l'apporter : seule l'absence avertit.
        if n >= 4:
            for kind, other, resist in (("magic", "AD", "armure"), ("physical", "AP", "résistance magique")):
                sources = sum(c.is_source(kind) for c in team)
                missing = "AP" if kind == "magic" else "AD"
                if sources == 0:
                    warns.append(CompositionWarning(
                        severity="critical" if n >= 5 else "warning",
                        message=f"Comp full {other} : aucune vraie source {missing} — l'ennemi peut stacker {resist}.",
                    ))
                elif sources == 1 and n >= 5:
                    warns.append(CompositionWarning(
                        severity="warning",
                        message=f"Comp à tendance {other} : une seule vraie source {missing}.",
                    ))

        # ── 2. Frontline ─────────────────────────────────────────────────
        # Tank + Divers (joueur, 28/09) : quelqu'un qui tient le contact.
        if n >= 3 and not any(c.is_frontline for c in team):
            warns.append(CompositionWarning(
                severity="warning",
                message="Pas de frontline — personne pour tenir le contact.",
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

        # ── 7. Aucun champion au corps à corps ───────────────────────────
        # Portée réelle de Data Dragon (chantier 11). À quatre, le cinquième
        # pick ne suffit plus à donner à l'équipe quelqu'un qui tienne le contact.
        if n >= 4 and not any(c.is_melee for c in team):
            warns.append(CompositionWarning(
                severity="warning",
                message="Aucun champion au corps à corps — personne pour tenir le contact face à l'engage.",
            ))

        return warns

    @staticmethod
    def _damage_shares(team: List[Champion]) -> Dict[str, float]:
        """Parts de dégâts de l'équipe, chacun pesant ce qu'il inflige réellement
        (mesure Master+). Remplace le poids fixe de poste (support × 0,4)."""
        phys = mag = true = 0.0
        for c in team:
            d = c.damage_dealt
            if d is None:   # sans mesure ni estimation : son profil, pour ~20 000 dégâts
                phys, mag, true = phys + 200 * c.damage.physical, mag + 200 * c.damage.magical, true + 200 * c.damage.true_dmg
            else:
                phys, mag, true = phys + d.physical, mag + d.magic, true + d.true
        total = phys + mag + true
        if total <= 0:
            return {"damage_physical": 0.0, "damage_magical": 0.0, "damage_true": 0.0}
        return {"damage_physical": round(100 * phys / total, 1),
                "damage_magical": round(100 * mag / total, 1),
                "damage_true": round(100 * true / total, 1)}

    def team_summary_from_list(self, team: List[Champion], draft: DraftState, candidate_role: str = "") -> Dict[str, float]:
        """Return a breakdown of team attributes for the UI, based on provided team list.

        Used to show the current team state WITHOUT adding a candidate.
        """
        n = max(len(team), 1)
        if n == 0:
            return {}

        return {
            **self._damage_shares(team),
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

    def team_summary(self, candidate: Champion, draft: DraftState, candidate_role: str = "") -> Dict[str, float]:
        """Return a breakdown of team attributes for the UI."""
        team = self._resolve_team(draft, candidate)
        n = max(len(team), 1)

        return {
            **self._damage_shares(team),
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
