"""Estimation en points de win rate : un terme = valeur + écart-type + source."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Literal, Optional

Source = Literal["observed", "heuristic", "model"]
RANKS = ("iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master_plus")


@dataclass
class Term:
    """Contribution d'un facteur en points de win rate, avec ses deux incertitudes.

    `abs_sd` est propre au champion : échantillonnage, ou ignorance quand la
    donnée manque. Elle ne s'annule jamais face à un autre candidat.

    `rel_sd` porte sur la constante qui convertit ce facteur en points de win
    rate. C'est la même erreur pour tous les candidats : elle s'annule dans la
    différence entre deux champions, et disparaît quand le terme vaut zéro.
    """
    name: str
    value: float
    abs_sd: float = 0.0
    source: str = "heuristic"
    sample: int = 0
    note: str = ""
    rel_sd: float = 0.0

    @property
    def sd(self) -> float:
        return math.sqrt((self.rel_sd * self.value) ** 2 + self.abs_sd ** 2)


@dataclass
class Estimate:
    terms: List[Term] = field(default_factory=list)

    @property
    def total(self) -> float:
        return sum(t.value for t in self.terms)

    @property
    def sd(self) -> float:
        return math.sqrt(sum(t.sd * t.sd for t in self.terms))

    def get(self, name: str) -> Optional[Term]:
        return next((t for t in self.terms if t.name == name), None)
