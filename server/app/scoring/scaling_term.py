"""Terme de scaling : face à une équipe qui scale, ce qui gagne tôt vaut plus.

Définition du joueur (26/09/2026) : un champion scale s'il gagne nettement plus
dans les parties longues que dans les courtes — mesuré sur Lolalytics par
`scripts/refresh_scaling.py`, en points de win rate (parties longues − courtes).

Ce que le joueur en fait : « Jarvan ou Lee Sin sont bons dans les persos scaling,
il peut gank, mettre le perso au fond et jamais avoir le temps de scale ». Seul ce
sens est codé : face à une équipe qui scale, un candidat fort tôt gagne, un
candidat qui scale perd. L'inverse — face à une équipe early, prendre un scaler —
n'a pas été affirmé et ne joue pas.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

from app.config import config
from app.models.draft import DraftState
from app.scoring.shrink import shrink
from app.scoring.types import Term

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "scaling.json"
ScalingData = Dict[str, Dict[str, dict]]


@lru_cache(maxsize=1)
def load_scaling() -> ScalingData:
    if not _DATA_PATH.exists():
        return {}
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    return {k.lower(): v for k, v in raw.items() if not k.startswith("_")}


def champion_scaling(key: str, role: str, data: ScalingData) -> Optional[float]:
    """Scaling rétréci par le nombre de parties, ou None sans mesure."""
    entry = {k.lower(): v for k, v in data.items()}.get(key.lower(), {}).get(role)
    if not entry:
        return None
    return shrink(float(entry["delta"]), int(entry["games"]), config.scoring.k_scaling)


def enemy_scaling(draft: DraftState, keys: Dict[int, str], data: ScalingData) -> Optional[float]:
    """Scaling moyen des ennemis révélés, chacun pondéré par sa distribution de postes."""
    values = []
    for pick in draft.enemy_picks:
        key = keys.get(pick.champion_id) if pick.champion_id else None
        if key is None:
            continue
        dist = (draft.role_distributions or {}).get(pick.champion_id) or ({pick.role: 1.0} if pick.role else {})
        weighted = [(p, champion_scaling(key, role, data)) for role, p in dist.items()]
        weighted = [(p, s) for p, s in weighted if s is not None and p > 0]
        mass = sum(p for p, _ in weighted)
        if mass > 0:
            values.append(sum(p * s for p, s in weighted) / mass)
    return sum(values) / len(values) if values else None


def scaling_term(candidate_key: str, role: str, draft: DraftState, keys: Dict[int, str],
                 data: ScalingData) -> Optional[Term]:
    c = config.scoring
    if not c.scaling_scale:
        return None
    enemy = enemy_scaling(draft, keys, data)
    mine = champion_scaling(candidate_key, role, data)
    if enemy is None or mine is None or enemy <= 0:
        return None
    # Équipe adverse à +10 points de scaling, candidat à −6 (Lee Sin) : +0,6 × échelle.
    value = -c.scaling_scale * enemy * mine / 100.0
    return Term("scaling", value, 0.0, "heuristic", 0,
                f"face à une équipe qui scale ({enemy:+.1f} pts), scaling du candidat {mine:+.1f}",
                rel_sd=c.scaling_rel)
