"""Probabilistic enemy-role inference.

The LCU API never reveals enemy positions in ranked games — we only ever know
the locked-in champion. The previous role_predictor.py picked the single most
likely role per enemy, which produced confident but wrong outputs (e.g. flagging
"Lane favorable contre Naafiri" when Naafiri was actually jungle and we were
mid).

This module returns a *distribution* over roles per enemy, then propagates
constraints: when a champion is mono-role-locked (>=0.85 on a single role),
that role is considered occupied and removed from every other enemy's
distribution. After renormalisation, ambiguous flex picks may collapse to
1.0 if a single legal role remains — exactly as a human would reason about
the draft.

The downstream consumer (matchup analyzer, reasons generator) reads
draft.role_distributions to compute weighted scores instead of a single
deterministic role.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, TYPE_CHECKING

from app.models.draft import DraftPick, ROLES

if TYPE_CHECKING:
    from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.role_inference")

# Confidence thresholds
MONO_ROLE_THRESHOLD = 0.85   # ≥ this on a single role → champion is "locked" to that role
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
        3. Find any enemy with prob ≥ MONO_ROLE_THRESHOLD on a single role
           → mark that role as occupied.
        4. For every other enemy, zero-out occupied roles and renormalise.
        5. Repeat until no new role gets locked. Up to 5 iterations.
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

    # Iterative constraint propagation.
    # Each iteration: highest-confidence champion per role claims it exclusively.
    # If two champions are both mono-role-locked to the same role, the one with
    # higher probability wins; the other is forced to redistribute to other roles.
    for _iter in range(5):
        # Build role ownership: only the highest-confidence champion per role wins.
        role_owner: Dict[str, int] = {}   # role → champion_id
        role_owner_p: Dict[str, float] = {}  # role → winning probability

        for cid, dist in out.items():
            if not dist:
                continue
            best_role, best_p = max(dist.items(), key=lambda x: x[1])
            if best_p < MONO_ROLE_THRESHOLD:
                continue
            # Claim the role only if no one else has claimed it yet, or we beat them
            if best_role not in role_owner or best_p > role_owner_p[best_role]:
                role_owner[best_role] = cid
                role_owner_p[best_role] = best_p

        occupied = set(role_owner.keys())

        changed = False
        for cid, dist in out.items():
            if not dist:
                continue
            best_role, best_p = max(dist.items(), key=lambda x: x[1])

            # Skip if this champion is the legitimate owner of its best role
            if best_p >= MONO_ROLE_THRESHOLD and role_owner.get(best_role) == cid:
                continue

            # Drop probability mass on roles owned by other champions
            new_dist = {r: p for r, p in dist.items() if r not in occupied}
            if not new_dist:
                # Pathological: all roles occupied → keep original (avoid empty dist)
                continue
            new_dist = _normalise(new_dist)
            if new_dist != dist:
                out[cid] = new_dist
                changed = True
                if best_p >= MONO_ROLE_THRESHOLD:
                    # Lost role conflict: log so devs can see it
                    logger.debug(
                        "Role conflict: champion %d lost %s to champion %d (%.2f < %.2f) — redistributed",
                        cid, best_role, role_owner.get(best_role, -1),
                        best_p, role_owner_p.get(best_role, 0),
                    )

        if not changed:
            break

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
