"""Intelligent role prediction for enemy champions.

When the LCU doesn't reveal enemy assigned positions (which is always in ranked),
we predict the most likely role for each enemy champion based on:
  1. Champion's known playable roles (from champion database + overrides)
  2. Meta pick rates per role (when available)
  3. Optimal assignment across all enemy picks (no two champs get the same role)

Uses an exhaustive search over all possible role permutations (max 5! = 120)
to find the globally optimal assignment, not just greedy per-champion.
"""
from __future__ import annotations

import itertools
import logging
from typing import Dict, List, Optional, TYPE_CHECKING

from app.models.draft import DraftPick, ROLES

if TYPE_CHECKING:
    from app.services.champion_data import ChampionDatabase

logger = logging.getLogger("dalia.role_predictor")

# ── Role affinity scores ────────────────────────────────────────────────
# Higher = more likely to be played in that role.
# Primary role gets 100, secondary 65, tertiary 35, off-role 3.

_ROLE_RANK_SCORES = [100, 65, 35, 15, 5]


def _champion_role_score(
    champion_roles: List[str],
    target_role: str,
    meta_pickrate: Optional[float] = None,
) -> float:
    """Score how likely a champion is to play a given role.

    Args:
        champion_roles: ordered list of roles the champion plays (primary first).
        target_role: the role we're considering assigning.
        meta_pickrate: optional pick-rate percentage for this champion in this role
                       (from meta stats, 0-100). When available, blended in.

    Returns:
        Score 0-100 indicating likelihood.
    """
    base = 3.0  # off-role baseline (very unlikely but not impossible)

    if target_role in champion_roles:
        idx = champion_roles.index(target_role)
        rank_score = _ROLE_RANK_SCORES[idx] if idx < len(_ROLE_RANK_SCORES) else 5
        base = float(rank_score)

    # Blend meta pick rate if available (gives real-world data weight)
    if meta_pickrate is not None and meta_pickrate > 0:
        # Normalise: a 15% pick rate in a role is very high, 1% is low
        meta_score = min(meta_pickrate * 5.0, 100.0)
        # Weighted blend: 60% champion roles, 40% meta data
        base = base * 0.6 + meta_score * 0.4

    return base


def predict_enemy_roles(
    enemy_picks: List[DraftPick],
    champion_db: "ChampionDatabase",
    meta_analyzer=None,
) -> List[DraftPick]:
    """Predict the most likely role for each enemy champion.

    Champions that already have a valid role assigned are left unchanged.
    The algorithm finds the optimal role assignment across all unassigned
    champions to maximise the total role-affinity score.

    Args:
        enemy_picks: list of enemy DraftPick objects (may have role=None).
        champion_db: champion database for role lookups.
        meta_analyzer: optional MetaAnalyzer for pick-rate data.

    Returns:
        Updated list of DraftPick with predicted roles filled in.
    """
    if not enemy_picks:
        return enemy_picks

    # Separate already-assigned from unassigned
    assigned_roles: set = set()
    assigned_indices: set = set()
    unassigned_indices: List[int] = []

    for i, pick in enumerate(enemy_picks):
        if pick.champion_id is None:
            continue
        if pick.role and pick.role in ROLES:
            assigned_roles.add(pick.role)
            assigned_indices.add(i)
        else:
            unassigned_indices.append(i)

    if not unassigned_indices:
        return enemy_picks  # all already assigned

    available_roles = [r for r in ROLES if r not in assigned_roles]

    if not available_roles:
        logger.warning("No available roles for %d unassigned enemy picks", len(unassigned_indices))
        return enemy_picks

    # Build score matrix: for each unassigned champion, score each available role
    score_matrix: List[Dict[str, float]] = []

    for idx in unassigned_indices:
        pick = enemy_picks[idx]
        champ = champion_db.get_by_id(pick.champion_id)
        if not champ:
            # Unknown champion — flat scores
            score_matrix.append({r: 20.0 for r in available_roles})
            continue

        scores: Dict[str, float] = {}
        for role in available_roles:
            meta_pr = None
            if meta_analyzer is not None:
                stats = champion_db.get_stats(champ.id, role)
                if stats and stats.pick_rate > 0:
                    meta_pr = stats.pick_rate
            scores[role] = _champion_role_score(champ.roles, role, meta_pr)

        score_matrix.append(scores)

    # Find optimal assignment using exhaustive permutation search
    # (max 5 champions × 5 roles → 5! = 120 permutations — trivial)
    n_champs = len(unassigned_indices)
    n_roles = len(available_roles)

    if n_champs > n_roles:
        # More champions than available roles — shouldn't happen in a normal draft
        logger.warning(
            "More unassigned champions (%d) than available roles (%d)",
            n_champs, n_roles,
        )
        # Truncate to available roles
        unassigned_indices = unassigned_indices[:n_roles]
        score_matrix = score_matrix[:n_roles]
        n_champs = n_roles

    best_assignment: Optional[List[str]] = None
    best_total = -1.0

    # Try all ways to assign n_champs roles from available_roles
    for perm in itertools.permutations(range(n_roles), n_champs):
        total = 0.0
        roles_for_this_perm = [available_roles[p] for p in perm]
        for ci, role in enumerate(roles_for_this_perm):
            total += score_matrix[ci].get(role, 0.0)
        if total > best_total:
            best_total = total
            best_assignment = roles_for_this_perm

    # Apply the best assignment
    if best_assignment:
        for ci, idx in enumerate(unassigned_indices):
            predicted_role = best_assignment[ci]
            enemy_picks[idx] = DraftPick(
                champion_id=enemy_picks[idx].champion_id,
                champion_key=enemy_picks[idx].champion_key,
                role=predicted_role,
            )
            champ = champion_db.get_by_id(enemy_picks[idx].champion_id)
            champ_name = champ.name if champ else str(enemy_picks[idx].champion_id)
            logger.info(
                "Predicted role for %s: %s (score: %.1f)",
                champ_name,
                predicted_role,
                score_matrix[ci].get(predicted_role, 0),
            )

    return enemy_picks
