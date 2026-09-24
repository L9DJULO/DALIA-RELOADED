"""Somme des termes, préférences, référence relative au pool et groupe de tête."""
from __future__ import annotations
import math
from dataclasses import replace
from typing import Dict, List, Optional, Protocol, Sequence, Tuple
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


class _SdTerm(Protocol):
    """Ce que `comparison_sd` lit d'un terme — satisfait par `Term` comme par `ScoreTerm`."""
    name: str
    value: float
    rel_sd: float
    abs_sd: float


def comparison_sd(terms_a: Sequence[_SdTerm], terms_b: Sequence[_SdTerm]) -> float:
    """Incertitude sur la DIFFÉRENCE entre deux estimations.

    Distincte de `Estimate.sd`, qui est l'incertitude sur un champion pris
    seul. Un terme heuristique porte la même erreur de conversion pour les
    deux candidats : elle s'annule dans la différence et ne coûte que l'écart
    de valeur. Un terme observé porte une erreur d'échantillonnage propre à
    chaque champion : les variances s'additionnent.

    Accepte indifféremment des `Term` ou des `ScoreTerm`, par typage
    structurel (`_SdTerm`), sans que l'un dépende de l'autre.
    """
    by_a = {t.name: t for t in terms_a}
    by_b = {t.name: t for t in terms_b}
    var = 0.0
    for name in by_a.keys() | by_b.keys():
        ta, tb = by_a.get(name), by_b.get(name)
        va = ta.value if ta else 0.0
        vb = tb.value if tb else 0.0
        rel = max(ta.rel_sd if ta else 0.0, tb.rel_sd if tb else 0.0)
        var += (rel * (va - vb)) ** 2
        var += (ta.abs_sd if ta else 0.0) ** 2 + (tb.abs_sd if tb else 0.0) ** 2
    return math.sqrt(var)


def top_group(items: Sequence[Tuple[float, Sequence]]) -> List[int]:
    """items = [(avantage, termes)] déjà triés par avantage décroissant.

    Le groupe de tête est contigu : on avance tant que l'écart au leader reste
    sous l'incertitude de leur comparaison — pas sous la somme de leurs
    incertitudes absolues, qui compte deux fois l'erreur de modèle partagée.
    """
    if not items:
        return []
    lead_adv, lead_terms = items[0]
    group = [0]
    for i in range(1, len(items)):
        adv, terms = items[i]
        if lead_adv - adv < comparison_sd(lead_terms, terms):
            group.append(i)
        else:
            break
    return group


def confidence_from_sd(sd: float) -> float:
    raw = 100.0 * (1.0 - sd / config.scoring.confidence_sd_scale)
    return round(min(95.0, max(8.0, raw)), 1)
