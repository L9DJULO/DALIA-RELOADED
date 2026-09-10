"""Somme des termes, préférences, référence relative au pool et groupe de tête."""
from __future__ import annotations
import math
from dataclasses import replace
from typing import Dict, List, Optional, Sequence, Tuple
from app.config import config
from app.scoring.types import Term

# Clés de préférence (stockées en base) → nom du terme qu'elles multiplient.
PREF_KEY_BY_TERM: Dict[str, str] = {
    "meta": "meta", "matchup": "matchup", "synergy": "synergy",
    "composition": "composition", "mastery": "mastery", "future_opponent": "draft_risk",
}


def apply_preferences(terms: Sequence[Term], prefs: Optional[Dict[str, float]]) -> List[Term]:
    if not prefs:
        return list(terms)
    lo, hi = config.scoring.pref_min, config.scoring.pref_max
    out = []
    for t in terms:
        key = PREF_KEY_BY_TERM.get(t.name)
        if key is None or key not in prefs:
            out.append(t)
            continue
        factor = min(hi, max(lo, float(prefs[key])))
        out.append(replace(t, value=t.value * factor))
    return out


def reference_mean(totals: Sequence[float]) -> float:
    return sum(totals) / len(totals) if totals else 0.0


def top_group(items: Sequence[Tuple[float, float]]) -> List[int]:
    """items = [(avantage, sd)] déjà triés par avantage décroissant.

    Le groupe de tête est contigu : on avance tant que l'écart au leader
    reste inférieur à la racine de la somme des variances.
    """
    if not items:
        return []
    lead_adv, lead_sd = items[0]
    group = [0]
    for i in range(1, len(items)):
        adv, sd = items[i]
        if lead_adv - adv < math.sqrt(lead_sd * lead_sd + sd * sd):
            group.append(i)
        else:
            break
    return group


def confidence_from_sd(sd: float) -> float:
    raw = 100.0 * (1.0 - sd / config.scoring.confidence_sd_scale)
    return round(min(95.0, max(8.0, raw)), 1)
