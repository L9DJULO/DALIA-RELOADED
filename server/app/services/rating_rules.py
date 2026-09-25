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
    """Peut-il démarrer un combat que l'équipe suit.

    Calage du 25/09 sur les notes du joueur : une Catcher fragile à distance ne
    démarre pas les combats (elle punit), un tireur mobile peut ouvrir en all-in.
    """
    if "Vanguard" in f.subclasses:
        return 5
    melee = not f.ranged
    if melee and f.subclasses & {"Catcher", "Warden", "Diver", "Juggernaut"}:
        return 4
    if "Assassin" in f.subclasses:
        return 2   # plonge sur une cible, ne lance pas le combat de l'équipe
    if melee and f.mobility >= 3:
        return 4
    if "Catcher" in f.subclasses and f.durability >= 2:
        return 4
    if "Marksman" in f.subclasses:
        return {3: 3, 2: 2}.get(f.mobility, 1)
    if f.ranged:
        return 3 if f.crowd_control >= 3 else 1
    return 3 if f.crowd_control >= 2 else 2


def poke(f: ChampionFacts) -> int:
    """Dégâts à distance avant le combat. Il faut de la portée ET des dégâts : un enchanteur
    à distance ne poke pas ; un tireur très mobile joue l'all-in (calage du 25/09)."""
    if not f.ranged:
        return 1
    if "Artillery" in f.subclasses:
        return 5
    if "Marksman" in f.subclasses:
        return 2 if f.mobility >= 3 else 3
    if f.style >= 6:
        return {3: 4, 2: 3}.get(f.damage, 2)
    return 2


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
    """Calage du 25/09 : un utilitaire Riot bas vaut surtout 3 chez le joueur ; un Warden,
    qui protège son équipe, vaut 5 quoi que dise Riot."""
    if "Warden" in f.subclasses:
        return 5
    base = 5 if f.utility >= 3 else 3
    return _clamp(base + (1 if "Enchanter" in f.subclasses else 0))


def burst(f: ChampionFacts) -> int:
    """Dégâts concentrés en une rotation (calage du 25/09 sur les notes du joueur).

    Un tireur explose une cible à proportion de sa mobilité (Draven, Samira, Lucian) ;
    immobile, il fait des dégâts soutenus (Jinx, Kog'Maw). Un mage à gros dégâts vaut 4,
    5 s'il est de la sous-classe Burst. Un champion à faibles dégâts garde 2.
    """
    if "Marksman" in f.subclasses and f.damage >= 3:
        return {3: 5, 2: 4}.get(f.mobility, 3)
    if f.damage >= 3:
        return 5 if "Burst" in f.subclasses else 4
    if f.damage == 2 and f.subclasses & {"Assassin", "Juggernaut", "Diver"}:
        return 4
    if f.damage == 2 and f.subclasses & {"Burst", "Battlemage", "Artillery"}:
        return 3
    return 2


FIGHTERS = frozenset({"Juggernaut", "Skirmisher", "Diver"})


def dps(f: ChampionFacts) -> int:
    """Dégâts soutenus. Un Fighter en a par définition (wiki LoL : « heavy, continuous
    damage »), même quand Riot place son style côté sorts."""
    level = _damage_level(f)
    if f.style <= 4:
        value = level
    else:
        value = level - 3 if f.style >= 6 else level - 1
    if f.subclasses & FIGHTERS:
        value = max(value, 3)
    return _clamp(value)


def tankiness(f: ChampionFacts) -> int:
    """Survivabilité effective (arbitrage du joueur). La mobilité sauve un champion fragile,
    elle ne fait pas d'un champion mi-résistant un tank (calage du 25/09). Un Warden tient
    la ligne quoi que dise Riot."""
    if "Warden" in f.subclasses:
        return 5
    base = {2: 3, 3: 5}.get(f.durability, 1)
    bonus = {2: 1, 3: 2}.get(f.mobility, 0) if f.durability <= 1 else 0
    return _clamp(base + bonus)


RULES: Dict[str, Callable[[ChampionFacts], int]] = {
    "cc": cc, "engage": engage, "poke": poke, "splitpush": splitpush, "teamfight": teamfight_fallback,
    "utility": utility, "burst": burst, "dps": dps, "tankiness": tankiness,
}


def derive(f: ChampionFacts) -> List[int]:
    return [RULES[d](f) for d in DIMENSIONS]
