"""Probabilistic enemy-role inference.

The LCU API never reveals enemy positions in ranked games — we only ever know
the locked-in champion. The previous role_predictor.py picked the single most
likely role per enemy, which produced confident but wrong outputs (e.g. flagging
"Lane favorable contre Naafiri" when Naafiri was actually jungle and we were
mid).

This module returns a *distribution* over roles per enemy, reasoned by
elimination over the whole enemy team: every assignment of distinct roles is
weighted by the product of the priors, and each enemy's distribution is its
marginal. A likelier mid pushes a flex off mid even when neither is certain
(Vladimir + Syndra : Vladimir leaves mid), a taken top keeps the flex on mid —
exactly as a human reasons about the draft (player's rule, 25/09/2026). The
former propagation only locked roles at ≥ 0.85 and ignored everything below.

The downstream consumer (matchup analyzer, reasons generator) reads
draft.role_distributions to compute weighted scores instead of a single
deterministic role.
"""
from __future__ import annotations

import json
import logging
from itertools import permutations
from pathlib import Path
from typing import Dict, List, Optional, TYPE_CHECKING

from app.models.draft import DraftPick, ROLES

if TYPE_CHECKING:
    from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.role_inference")

# Confidence thresholds
HIGH_CONFIDENCE = 0.85       # max prob ≥ this → no ambiguity warning needed


# ── Load static distributions ────────────────────────────────────────
_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "role_distribution.json"
_DISTRIBUTION_CACHE: Optional[Dict[str, Dict[str, float]]] = None


def load_role_distribution() -> Dict[str, Dict[str, float]]:
    """Load the static champion-role priors (cached)."""
    global _DISTRIBUTION_CACHE
    if _DISTRIBUTION_CACHE is not None:
        return _DISTRIBUTION_CACHE

    if not _DATA_PATH.exists():
        logger.warning("role_distribution.json missing at %s — empty fallback", _DATA_PATH)
        _DISTRIBUTION_CACHE = {}
        return _DISTRIBUTION_CACHE

    with _DATA_PATH.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    # strip metadata
    _DISTRIBUTION_CACHE = {k: v for k, v in raw.items() if not k.startswith("_")}
    logger.info("Loaded role distribution for %d champions", len(_DISTRIBUTION_CACHE))
    return _DISTRIBUTION_CACHE


def _prior_for_champion(
    champion_name: str,
    champion_key: str,
    champion_roles: List[str],
    distribution: Dict[str, Dict[str, float]],
) -> Dict[str, float]:
    """Return the prior distribution for a champion.

    Lookup order: name → key → fallback derived from Champion.roles.
    """
    if champion_name in distribution:
        return dict(distribution[champion_name])
    if champion_key in distribution:
        return dict(distribution[champion_key])

    # Fallback: derive from champion.roles ordering
    if not champion_roles:
        # Truly unknown — uniform across all 5 roles
        return {r: 1.0 / 5 for r in ROLES}

    # primary 0.85, secondary 0.12, tertiary 0.03
    weights = [0.85, 0.12, 0.03]
    out: Dict[str, float] = {}
    used = 0.0
    for i, r in enumerate(champion_roles):
        if i < len(weights):
            out[r] = weights[i]
            used += weights[i]
        else:
            out[r] = 0.0
    # Normalise (in case champion_roles has only 1-2 entries)
    if used > 0:
        for r in out:
            out[r] /= used
    return out


def _normalise(d: Dict[str, float]) -> Dict[str, float]:
    total = sum(d.values())
    if total <= 0:
        return d
    return {k: v / total for k, v in d.items()}


def infer_enemy_roles(
    enemy_picks: List[DraftPick],
    champion_db: "ChampionDatabase",
    role_distribution: Optional[Dict[str, Dict[str, float]]] = None,
) -> Dict[int, Dict[str, float]]:
    """Compute a per-enemy role distribution with constraint propagation.

    Args:
        enemy_picks: locked enemy picks (in pick order).
        champion_db: needed to resolve names + fallback roles.
        role_distribution: optional override (otherwise loads JSON file).

    Returns:
        Dict[champion_id, Dict[role, probability]].
        Only includes enemies with a champion_id.

    Algorithm:
        1. Each enemy starts from its static prior (from JSON or fallback).
        2. If an enemy already has an explicit role assigned (LCU did reveal
           it for some reason, or this is a deterministic test setup), pin
           that role to 1.0.
        3. Enumerate every assignment of distinct roles to the enemies (at most
           5! = 120), weight it by the product of the priors, and return each
           enemy's marginal. No role absent from a prior is ever introduced.
        4. If no assignment is possible (two champions that only play mid),
           keep each prior as is rather than fail.
    """
    distribution = role_distribution if role_distribution is not None else load_role_distribution()
    out: Dict[int, Dict[str, float]] = {}

    for ep in enemy_picks:
        if ep.champion_id is None:
            continue

        if ep.role and ep.role in ROLES:
            # Role already pinned (e.g. test harness or future LCU update)
            out[ep.champion_id] = {ep.role: 1.0}
            continue

        champ = champion_db.get_by_id(ep.champion_id)
        name = champ.name if champ else (ep.champion_key or "")
        key = champ.key if champ else (ep.champion_key or "")
        roles = champ.roles if champ else []
        out[ep.champion_id] = _prior_for_champion(name, key, roles, distribution)

    return _eliminate(out)


def _eliminate(priors: Dict[int, Dict[str, float]]) -> Dict[int, Dict[str, float]]:
    """Marginales exactes sur les répartitions de postes distincts, pondérées par les priors."""
    ids = [cid for cid, d in priors.items() if d]
    if not ids or len(ids) > len(ROLES):
        return priors
    totals = {cid: {r: 0.0 for r in priors[cid]} for cid in ids}
    mass = 0.0
    for assignment in permutations(ROLES, len(ids)):
        w = 1.0
        for cid, role in zip(ids, assignment):
            w *= priors[cid].get(role, 0.0)
            if w == 0.0:
                break
        if w == 0.0:
            continue
        mass += w
        for cid, role in zip(ids, assignment):
            totals[cid][role] += w
    if mass <= 0.0:
        logger.debug("No consistent role assignment for enemies %s — keeping priors", ids)
        return priors
    out = dict(priors)
    for cid in ids:
        out[cid] = {r: p / mass for r, p in totals[cid].items() if p > 0.0}
    return out


def most_likely_role(distribution: Dict[str, float]) -> Optional[str]:
    """Return the highest-probability role from a distribution, or None if empty."""
    if not distribution:
        return None
    return max(distribution.items(), key=lambda x: x[1])[0]


def is_ambiguous(distribution: Dict[str, float], threshold: float = HIGH_CONFIDENCE) -> bool:
    """True when no single role exceeds the high-confidence threshold."""
    if not distribution:
        return False
    return max(distribution.values()) < threshold
