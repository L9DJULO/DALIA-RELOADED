"""Termes heuristiques convertis en points de WR : synergie de kit, mécaniques, modèle."""
from app.config import config
from app.scoring.types import Term


def synergy_term(score_0_100: float, duo_bonus: bool) -> Term:
    c = config.scoring
    value = max(-c.synergy_cap, min(c.synergy_cap, (score_0_100 - 50.0) * c.synergy_scale))
    if duo_bonus:
        value *= c.synergy_duo_factor
    return Term("synergy", value, 0.0, "heuristic", 0,
                "synergie de kit" + (", duo" if duo_bonus else ""), rel_sd=c.synergy_rel)


def mechanics_term(delta: float) -> Term:
    c = config.scoring
    return Term("mechanics", delta * c.mechanics_scale, 0.0, "heuristic", 0,
                "règles d'interactions de kits", rel_sd=c.mechanics_rel)


def model_term(delta_pp: float) -> Term:
    c = config.scoring
    return Term("model", max(-c.model_cap, min(c.model_cap, delta_pp)), 0.0, "model", 0,
                "WPA estimé DALIA, écart à la moyenne des alternatives", rel_sd=c.model_rel)
