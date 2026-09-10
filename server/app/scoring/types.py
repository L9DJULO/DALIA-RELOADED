"""Estimation en points de win rate : un terme = valeur + écart-type + source."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import List, Literal, Optional

Source = Literal["observed", "heuristic", "model"]
RANKS = ("iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master_plus")


@dataclass
class Term:
    name: str
    value: float
    sd: float
    source: str = "heuristic"
    sample: int = 0
    note: str = ""


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
