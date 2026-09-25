"""Règles de conversion : faits publiés sur un champion → notes 1-5.

Chantiers 4 et 14 (spec 2026-09-25). Une fonction pure par dimension, lisible,
pour qu'un écart avec les notes du joueur désigne une règle à corriger. Aucune
règle ne nomme un champion, sauf les ancres de splitpush données par le joueur.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Dict, FrozenSet, List, Tuple

DIMENSIONS: Tuple[str, ...] = ("cc", "engage", "poke", "splitpush", "teamfight", "utility", "burst", "dps", "tankiness")
SPLITPUSH_ANCHORS = frozenset({"Fiora", "Trundle", "Yorick", "Tryndamere", "Nasus"})


@dataclass(frozen=True)
class ChampionFacts:
    """Ce que Riot et le wiki publient sur un champion. Notes Riot sur 0-3."""
    key: str
    damage: int
    durability: int
    crowd_control: int
    mobility: int
    utility: int
    style: int            # 1 = attaques de base … 10 = sorts
    ranged: bool
    subclasses: FrozenSet[str] = frozenset()


def _clamp(v: int) -> int:
    return max(1, min(5, int(v)))


def _damage_level(f: ChampionFacts) -> int:
    return {2: 3, 3: 5}.get(f.damage, 1)


def cc(f: ChampionFacts) -> int:
    if f.crowd_control >= 3 and f.durability >= 3:
        return 5
    return _clamp({1: 2, 2: 3, 3: 4}.get(f.crowd_control, 1))


def engage(f: ChampionFacts) -> int:
    if "Vanguard" in f.subclasses:
        return 5
    if f.subclasses & {"Catcher", "Diver"}:
        return 4
    if f.crowd_control >= 2 and f.mobility >= 2:
        return 3
    return 2 if f.crowd_control >= 2 else 1


def poke(f: ChampionFacts) -> int:
    if not f.ranged:
        return 1
    if "Artillery" in f.subclasses:
        return 5
    if f.style >= 6:
        return 4
    return 3 if "Marksman" in f.subclasses else 2


def splitpush(f: ChampionFacts) -> int:
    if f.key in SPLITPUSH_ANCHORS:
        return 5
    if f.subclasses & {"Skirmisher", "Juggernaut"}:
        return 4
    if f.subclasses & {"Diver", "Specialist"}:
        return 3
    return 2 if "Marksman" in f.subclasses else 1


def teamfight_fallback(f: ChampionFacts) -> int:
    """Repli quand la mesure pro manque (spec §5.2)."""
    return 4 if f.subclasses & {"Vanguard", "Warden", "Battlemage", "Enchanter"} else 3


def utility(f: ChampionFacts) -> int:
    base = {2: 4, 3: 5}.get(f.utility, 2)
    return _clamp(base + (1 if "Enchanter" in f.subclasses else 0))


def burst(f: ChampionFacts) -> int:
    level = _damage_level(f)
    return _clamp(level if f.style >= 6 else level - 1)


def dps(f: ChampionFacts) -> int:
    level = _damage_level(f)
    if f.style <= 4:
        return _clamp(level)
    return _clamp(level - 3 if f.style >= 6 else level - 1)


def tankiness(f: ChampionFacts) -> int:
    """Survivabilité effective : la mobilité protège autant que la résistance."""
    base = {2: 3, 3: 5}.get(f.durability, 1)
    return _clamp(base + {2: 1, 3: 2}.get(f.mobility, 0))


RULES: Dict[str, Callable[[ChampionFacts], int]] = {
    "cc": cc, "engage": engage, "poke": poke, "splitpush": splitpush, "teamfight": teamfight_fallback,
    "utility": utility, "burst": burst, "dps": dps, "tankiness": tankiness,
}


def derive(f: ChampionFacts) -> List[int]:
    return [RULES[d](f) for d in DIMENSIONS]
