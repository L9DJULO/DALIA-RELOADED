"""Bans : ce que coûte à mon pool l'adversaire de lane qu'on laisse passer.

Un ban vaut les points de win rate qu'il évite. Pour un adversaire de mon rôle,
c'est la probabilité de le croiser en lane (sa part de pick rate parmi les
champions joués à ce poste) fois ce qu'il coûte à mon pool (matchup rétréci par
le nombre de parties, moyenné sur le pool pondéré par palier). Un pick rare au
delta spectaculaire mesuré sur cent parties n'est donc ni probable ni sûr : il
ne passe plus devant un counter que tout le monde joue.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Hashable, List, Sequence, Tuple

from app.scoring.shrink import shrink

# En dessous d'un demi-point perdu, le champion du pool n'est pas cité comme « countered ».
NAMED_LOSS = 0.5


@dataclass
class PoolCounters:
    name: str
    weight: float                              # poids du palier (S 1.0 … D 0.25)
    matchups: Dict[int, Tuple[int, float]]     # adversaire → (parties, d2)


@dataclass
class Threat:
    champion_id: int
    value: float                               # points de win rate attendus, perdus face à lui
    countered: List[str] = field(default_factory=list)


def pool_counter_threats(pick_rates: Dict[int, float], pool: Sequence[PoolCounters], k: int) -> List[Threat]:
    """Adversaires de lane classés par points de win rate qu'ils coûtent au pool.

    `pick_rates` : les champions joués à mon poste (déjà filtrés : disponibles,
    hors de mon pool, pick rate suffisant) et leur pick rate.
    """
    total_pr = sum(pick_rates.values())
    total_weight = sum(p.weight for p in pool)
    if total_pr <= 0 or total_weight <= 0:
        return []
    threats = []
    for cid, pr in pick_rates.items():
        losses = []
        for p in pool:
            games, d2 = p.matchups.get(cid, (0, 0.0))
            losses.append((max(0.0, -shrink(d2, games, k)), p))
        named = [p.name for lost, p in sorted(losses, key=lambda x: -x[0]) if lost >= NAMED_LOSS]
        if not named:  # un « counter de ton pool » qui ne coûte rien de net à personne n'en est pas un
            continue
        loss = sum(p.weight * lost for lost, p in losses) / total_weight
        threats.append(Threat(cid, pr / total_pr * loss, named))
    return sorted(threats, key=lambda t: -t.value)


def choose_bans(role: Sequence[Hashable], others: Sequence[Hashable], n: int = 3, role_slots: int = 2) -> List[Hashable]:
    """La plupart des bans visent mon adversaire de lane ; le reste, la menace la plus forte ailleurs.

    Chaque liste est déjà classée. Une liste trop courte laisse ses places à l'autre.
    """
    chosen: List[Hashable] = []
    for pick in list(role[:role_slots]) + list(others) + list(role[role_slots:]):
        if pick not in chosen:
            chosen.append(pick)
        if len(chosen) == n:
            break
    return chosen
