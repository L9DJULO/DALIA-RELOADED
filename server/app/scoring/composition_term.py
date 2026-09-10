"""Composition marginale : ce que le candidat ajoute que l'équipe n'a pas encore."""
from __future__ import annotations
from typing import List, Optional
from app.config import config
from app.models.champion import Champion
from app.scoring.types import Term
from app.services.composition_archetype import Archetype, ArchetypeResult, archetype_counter_adjust


def team_value(team: List[Champion], mechanics, composition) -> float:
    c = config.scoring
    if not team:
        return 0.0
    covered = set().union(*(mechanics.coverage(ch) for ch in team))
    value = sum(c.comp_tool_weights.get(tool, 0.0) for tool in covered)
    for w in composition.team_warnings(team):
        value -= c.comp_warning_penalty.get(w.severity, 0.0)
    return value


def composition_term(candidate: Champion, allies: List[Champion], mechanics, composition) -> Optional[Term]:
    if not allies:
        return None
    c = config.scoring
    raw = team_value(allies + [candidate], mechanics, composition) - team_value(allies, mechanics, composition)
    bounded = max(-c.comp_cap, min(c.comp_cap, raw))
    value = bounded * min(1.0, len(allies) / 4.0)
    return Term("composition", value, c.comp_sd, "heuristic", 0, f"apport marginal avec {len(allies)} allié(s) connu(s)")


def archetype_term(candidate: Champion, archetype: Optional[ArchetypeResult]) -> Optional[Term]:
    if archetype is None or archetype.primary == Archetype.MIXED:
        return None
    c = config.scoring
    value = (archetype_counter_adjust(candidate, archetype.primary) - 1.0) * c.archetype_scale * archetype.confidence
    return Term("archetype", value, c.archetype_sd, "heuristic", archetype.picks_revealed,
                f"réponse à une composition {archetype.primary.value}")
