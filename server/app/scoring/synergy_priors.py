"""k de rétrécissement des synergies de paire, par palier et type de paire (spec 2026-09-28 §4).

La dispersion brute de d2 est surtout du bruit d'échantillonnage. Bayes empirique :
τ² = var(d2) − moyenne(2500 / n). Avec k = 2500 / τ², shrink et shrink_sd donnent
la moyenne et l'écart-type a posteriori du modèle normal-normal.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from app.config import config

PRIORS_PATH = Path(__file__).resolve().parents[1] / "data" / "synergy_priors.json"


def pair_kind(role_a: str, role_b: str) -> str:
    """Le duo de bot interagit bien plus que les autres paires : τ ≈ 1,05 contre 0,46 en Master+."""
    return "bot_support" if {role_a, role_b} == {"bot", "support"} else "other"


@lru_cache(maxsize=1)
def load_priors() -> Dict[str, Dict[str, int]]:
    try:
        tiers = json.loads(PRIORS_PATH.read_text(encoding="utf-8")).get("tiers", {})
    except (OSError, ValueError, AttributeError):
        return {}
    return tiers if isinstance(tiers, dict) else {}


def prior_k(tier: Optional[str], kind: str) -> int:
    """k du palier demandé, sinon du palier par défaut, sinon de la configuration."""
    priors = load_priors()
    for t in (tier, config.rank_tier):
        k = (priors.get(t) or {}).get(kind) if t else None
        if k:
            return int(k)
    return int(config.scoring.synergy_k_default[kind])


def pairs_by_kind(pages: Dict[Tuple[int, str], Dict[str, Dict[int, Tuple[float, int, float]]]]
                  ) -> Dict[str, List[Tuple[float, int]]]:
    """(d2, parties) par type de paire, depuis des pages parse_team indexées par (champion, poste).

    Une paire vue depuis les deux pages (Xayah chez Rakan, Rakan chez Xayah) ne compte
    qu'une fois : la première lue. Les deux d2 concordent à 0,2 près (vérifié le 27/09).
    """
    seen = set()
    out: Dict[str, List[Tuple[float, int]]] = {"bot_support": [], "other": []}
    for (cid, role), team in pages.items():
        for ally_role, rows in team.items():
            for ally_id, (d2, games, _) in rows.items():
                key = frozenset(((cid, role), (ally_id, ally_role)))
                if key in seen:
                    continue
                seen.add(key)
                out[pair_kind(role, ally_role)].append((d2, games))
    return out


def estimate_k(pairs: Iterable[Tuple[float, int]], min_games: int = 300,
               min_pairs: int = 30) -> Optional[Tuple[int, float, int]]:
    """(k, τ, nombre de paires) ; None si trop peu de paires ou si tout est du bruit."""
    rows = [(d2, n) for d2, n in pairs if n >= min_games]
    if len(rows) < min_pairs:
        return None
    mean = sum(d for d, _ in rows) / len(rows)
    var = sum((d - mean) ** 2 for d, _ in rows) / len(rows)
    tau2 = var - sum(2500.0 / n for _, n in rows) / len(rows)
    if tau2 <= 0:
        return None
    return round(2500.0 / tau2), math.sqrt(tau2), len(rows)
