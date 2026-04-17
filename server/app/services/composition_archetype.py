"""Composition archetype detector.

Classifies an enemy (or ally) team into a strategic archetype based on the
champions already locked in, then exposes an `archetype_counter_adjust`
multiplier used by the draft engine to reward candidates that counter the
detected archetype and penalise those that feed into it.

Archetypes
----------
    POKE            — long-range attrition (Varus, Xerath, Jayce…)
    ENGAGE          — wombo-combo AoE initiation (Malphite, Leona, Kennen…)
    KITE            — hypercarry + peel, wants extended fights (Vayne + Lulu…)
    SPLIT           — side-lane pressure, duelists (Fiora, Tryndamere, Camille…)
    PROTECT_CARRY   — immobile hypercarry with dedicated peel (Jinx + Lulu + Braum)
    PICK            — burst + crowd-control to catch isolated targets (Thresh, Ahri, LeBlanc)
    MIXED           — no dominant signal / too few picks revealed

Detection uses the 1-5 `ChampionRatings` already attached to each `Champion`
(see ``app/models/champion.py``). The five ratings that matter most here are
``engage``, ``poke``, ``splitpush``, ``utility`` and ``tankiness`` — plus the
Riot `tags` list (Marksman / Assassin / Tank / …) for archetype priors.

Scoring is score-based and returns a ranked list, so callers can either pick
the top archetype or take the full vector. We only commit to a primary
archetype once at least ``MIN_PICKS_FOR_ARCHETYPE`` enemies are locked in
AND the top archetype beats the runner-up by ``DECIDE_MARGIN``; below that
threshold we stay MIXED (safer than a confident wrong call).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple

from app.models.champion import Champion


class Archetype(str, Enum):
    POKE = "poke"
    ENGAGE = "engage"
    KITE = "kite"
    SPLIT = "split"
    PROTECT_CARRY = "protect_carry"
    PICK = "pick"
    MIXED = "mixed"


MIN_PICKS_FOR_ARCHETYPE = 3  # need ≥ 3 enemies locked to classify with confidence
DECIDE_MARGIN = 0.18         # top score must beat #2 by this much, else MIXED


@dataclass
class ArchetypeResult:
    """Rich detection result so callers can reason about confidence."""
    primary: Archetype
    scores: Dict[Archetype, float]  # 0..1 normalised scores per archetype
    confidence: float               # 0..1 — based on picks_revealed + margin
    picks_revealed: int

    @property
    def is_confident(self) -> bool:
        return self.primary != Archetype.MIXED and self.confidence >= 0.5


# ── Detection ────────────────────────────────────────────────────────────────

def detect_archetype(champions: List[Champion]) -> ArchetypeResult:
    """Score each archetype for the given team and return the primary one.

    Returns Archetype.MIXED if the team is too small or too balanced for a
    confident classification.
    """
    n = len(champions)
    if n == 0:
        return ArchetypeResult(Archetype.MIXED, {}, 0.0, 0)

    scores: Dict[Archetype, float] = {
        Archetype.POKE:          _score_poke(champions),
        Archetype.ENGAGE:        _score_engage(champions),
        Archetype.KITE:          _score_kite(champions),
        Archetype.SPLIT:         _score_split(champions),
        Archetype.PROTECT_CARRY: _score_protect_carry(champions),
        Archetype.PICK:          _score_pick(champions),
    }

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top, top_score = ranked[0]
    runner_score = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = top_score - runner_score

    picks_confidence = min(1.0, n / 5.0)
    margin_confidence = min(1.0, margin / 0.3)
    confidence = picks_confidence * (0.5 + 0.5 * margin_confidence)

    if n < MIN_PICKS_FOR_ARCHETYPE or margin < DECIDE_MARGIN or top_score < 0.35:
        return ArchetypeResult(Archetype.MIXED, scores, confidence, n)

    return ArchetypeResult(top, scores, confidence, n)


# Each _score_* returns 0..1 based on how strongly the team matches the pattern.

def _score_poke(team: List[Champion]) -> float:
    n = len(team)
    high_poke = sum(1 for c in team if c.ratings.poke >= 4)
    mid_poke  = sum(1 for c in team if c.ratings.poke >= 3)
    avg_engage = _avg(c.ratings.engage for c in team)
    avg_tank   = _avg(c.ratings.tankiness for c in team)
    score = 0.0
    score += 0.55 * (high_poke / max(n, 1))
    score += 0.20 * (mid_poke  / max(n, 1))
    score += 0.15 * (1.0 - min(avg_engage / 4.0, 1.0))   # low engage bonus
    score += 0.10 * (1.0 - min(avg_tank   / 4.0, 1.0))   # squishy bonus
    return min(score, 1.0)


def _score_engage(team: List[Champion]) -> float:
    n = len(team)
    hard_engage = sum(1 for c in team if c.ratings.engage >= 4)
    avg_cc        = _avg(c.ratings.cc for c in team)
    avg_teamfight = _avg(c.ratings.teamfight for c in team)
    tanks = sum(1 for c in team if c.ratings.tankiness >= 4 or "Tank" in c.tags)
    score = 0.0
    score += 0.40 * min(hard_engage / 2.0, 1.0)          # 2+ engage tools = full mark
    score += 0.25 * (avg_cc / 5.0)
    score += 0.20 * (avg_teamfight / 5.0)
    score += 0.15 * min(tanks / 2.0, 1.0)
    return min(score, 1.0)


def _score_kite(team: List[Champion]) -> float:
    n = len(team)
    has_dps_carry = any(c.ratings.dps >= 4 for c in team)
    peelers = sum(1 for c in team if c.ratings.utility >= 4)
    avg_engage = _avg(c.ratings.engage for c in team)
    avg_poke   = _avg(c.ratings.poke for c in team)
    avg_burst  = _avg(c.ratings.burst for c in team)
    score = 0.0
    score += 0.35 * (1.0 if has_dps_carry else 0.0)
    score += 0.30 * min(peelers / 2.0, 1.0)
    score += 0.20 * (1.0 - min(avg_engage / 4.0, 1.0))
    score += 0.10 * (1.0 - min(avg_poke / 4.0, 1.0))
    score += 0.05 * (1.0 - min(avg_burst / 4.0, 1.0))    # extended fights = not burst
    return min(score, 1.0)


def _score_split(team: List[Champion]) -> float:
    n = len(team)
    splitters = sum(1 for c in team if c.ratings.splitpush >= 4)
    avg_split     = _avg(c.ratings.splitpush for c in team)
    avg_teamfight = _avg(c.ratings.teamfight for c in team)
    score = 0.0
    score += 0.55 * min(splitters / 2.0, 1.0)            # 2 splitters = classic 1-3-1
    score += 0.25 * (avg_split / 5.0)
    score += 0.20 * (1.0 - min(avg_teamfight / 4.0, 1.0))
    return min(score, 1.0)


def _score_protect_carry(team: List[Champion]) -> float:
    # Classic signal: immobile hypercarry (Marksman tankiness ≤ 2) + 2 peelers
    has_immobile_carry = any(
        ("Marksman" in c.tags and c.ratings.tankiness <= 2 and c.ratings.dps >= 4)
        for c in team
    )
    peelers = sum(1 for c in team if c.ratings.utility >= 4)
    frontline = sum(1 for c in team if c.ratings.tankiness >= 4)
    score = 0.0
    score += 0.50 * (1.0 if has_immobile_carry else 0.0)
    score += 0.30 * min(peelers / 2.0, 1.0)
    score += 0.20 * min(frontline / 1.0, 1.0)            # at least one body to absorb engage
    return min(score, 1.0)


def _score_pick(team: List[Champion]) -> float:
    n = len(team)
    avg_burst = _avg(c.ratings.burst for c in team)
    avg_cc    = _avg(c.ratings.cc for c in team)
    hooks_or_roots = sum(
        1 for c in team
        if c.ratings.cc >= 4 and c.ratings.burst >= 3 and c.ratings.tankiness <= 3
    )
    assassins = sum(1 for c in team if "Assassin" in c.tags)
    avg_teamfight = _avg(c.ratings.teamfight for c in team)
    score = 0.0
    score += 0.30 * (avg_burst / 5.0)
    score += 0.25 * (avg_cc / 5.0)
    score += 0.20 * min(hooks_or_roots / 2.0, 1.0)
    score += 0.15 * min(assassins / 2.0, 1.0)
    score += 0.10 * (1.0 - min(avg_teamfight / 4.5, 1.0))  # pick comps avoid straight 5v5
    return min(score, 1.0)


# ── Counter adjustment ──────────────────────────────────────────────────────

def archetype_counter_adjust(candidate: Champion, enemy_archetype: Archetype) -> float:
    """Multiplicative score adjustment for a candidate vs the enemy archetype.

    Returns a value roughly in [0.88, 1.15]:
        > 1.0  candidate naturally counters the enemy pattern
        = 1.0  neutral (or MIXED/no confident read)
        < 1.0  candidate feeds into the enemy game plan

    The magnitudes stay small on purpose — archetype is one signal among
    matchup / synergy / composition, not an override. We use explicit
    thresholds on `ratings` so the logic is legible and tweakable.
    """
    if enemy_archetype == Archetype.MIXED:
        return 1.0

    r = candidate.ratings
    tags = set(candidate.tags)
    is_immobile_carry = ("Marksman" in tags or "Mage" in tags) and r.tankiness <= 2
    has_mobility_proxy = (
        "Assassin" in tags
        or ("Fighter" in tags and r.splitpush >= 3)
        or r.engage >= 4
    )
    is_tank = "Tank" in tags or r.tankiness >= 4
    has_peel = r.utility >= 4
    has_hard_engage = r.engage >= 4
    has_poke = r.poke >= 4

    adj = 1.0

    if enemy_archetype == Archetype.ENGAGE:
        # We need disengage / peel / mobility to kite their wombo.
        if has_peel:                                 adj += 0.08
        if has_mobility_proxy:                       adj += 0.05
        if is_tank:                                  adj += 0.03   # soaks the engage
        if is_immobile_carry and not has_peel:       adj -= 0.10   # free kill
        if r.engage >= 4 and r.teamfight < 3:        adj -= 0.03   # same-engage trade is risky

    elif enemy_archetype == Archetype.POKE:
        # We need to close distance or out-sustain the poke.
        if has_hard_engage:                          adj += 0.10
        if is_tank:                                  adj += 0.05   # soaks poke
        if has_mobility_proxy:                       adj += 0.04
        if has_poke and r.tankiness <= 2:            adj -= 0.07   # poke-vs-poke + squishy = lose trade
        if is_immobile_carry and not has_hard_engage: adj -= 0.05

    elif enemy_archetype == Archetype.KITE:
        # We need to catch the carry before they set up — picks + hard engage.
        if has_hard_engage:                          adj += 0.09
        if "Assassin" in tags:                       adj += 0.07
        if r.burst >= 4 and r.cc >= 3:               adj += 0.04
        if is_immobile_carry:                        adj -= 0.06   # out-kited
        if r.splitpush >= 4 and r.teamfight < 3:     adj -= 0.03   # side-laner gets bled

    elif enemy_archetype == Archetype.SPLIT:
        # We need wave-clear, global pressure, or a duelist of our own.
        if r.splitpush >= 4:                         adj += 0.08   # match their splitter
        if r.teamfight >= 4 and r.engage >= 3:       adj += 0.05   # force 5v4
        if r.poke >= 4:                              adj += 0.03   # siege objectives
        if is_immobile_carry and r.dps < 4:          adj -= 0.04

    elif enemy_archetype == Archetype.PROTECT_CARRY:
        # Peel is strong → we need dive (mobility onto backline) or poke through it.
        if "Assassin" in tags:                       adj += 0.09
        if has_mobility_proxy:                       adj += 0.06
        if has_poke:                                 adj += 0.05   # chip through shields
        if r.engage >= 4 and "Tank" in tags:         adj -= 0.04   # eats all the peel, bricks
        if is_immobile_carry and not has_peel:       adj -= 0.03

    elif enemy_archetype == Archetype.PICK:
        # Group up, be hard to isolate, survive burst.
        if is_tank:                                  adj += 0.08
        if has_peel:                                 adj += 0.05
        if r.teamfight >= 4:                         adj += 0.04
        if is_immobile_carry:                        adj -= 0.08   # gets caught, deleted
        if "Assassin" in tags and r.tankiness <= 2:  adj -= 0.03   # isolates themselves

    return max(0.88, min(1.15, adj))


# ── Helpers ─────────────────────────────────────────────────────────────────

def _avg(values) -> float:
    values = list(values)
    return (sum(values) / len(values)) if values else 0.0


def summarise(result: ArchetypeResult) -> Dict[str, object]:
    """Serialisable view, handy for logs and API responses."""
    return {
        "primary": result.primary.value,
        "confidence": round(result.confidence, 2),
        "picks_revealed": result.picks_revealed,
        "scores": {k.value: round(v, 2) for k, v in result.scores.items()},
    }
