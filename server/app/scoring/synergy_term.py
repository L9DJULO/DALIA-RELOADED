"""Terme synergie mesuré : interaction de paire Lolalytics rétrécie (chantier 3, spec 2026-09-28)."""
from __future__ import annotations

import math
from typing import Optional

from app.config import config
from app.models.draft import DraftState
from app.scoring.types import Term


async def observed_synergy_term(analyzer, champion_id: int, role: str, draft: DraftState,
                                tier: Optional[str], duo_partner_role: Optional[str] = None) -> Optional[Term]:
    """Somme des paires rétrécies avec les alliés connus. None : page indisponible, repli de kit.

    Pas de plafond : le rétrécissement borne la valeur, comme pour le matchup.
    L'incertitude est propre à chaque paire (abs_sd) et ne s'annule pas entre deux
    candidats ; les alliés sont connus, ce n'est pas un risque subi (outcome_sd = 0).
    Le facteur duo ne pèse que la paire formée avec le partenaire.
    """
    observations = await analyzer.observations(champion_id, role, draft, tier)
    if observations is None:
        return None
    c = config.scoring
    value = variance = 0.0
    for o in observations:
        w = c.synergy_duo_factor if duo_partner_role and o.ally_role == duo_partner_role else 1.0
        value += w * o.value
        variance += (w * o.sd) ** 2
    scale = c.synergy_observed_scale
    return Term("synergy", value * scale, math.sqrt(variance) * scale, "observed",
                sum(o.games for o in observations), f"interaction mesurée avec {len(observations)} allié(s)")
