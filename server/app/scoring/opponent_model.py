"""Adversaire futur : espérance du matchup sur les picks adverses possibles dans mon rôle.

Remplace le « risque de draft », la liste de champions à risque en blind, le
bonus flex et la pénalité situationnelle : tout émerge de la distribution.
"""
from __future__ import annotations
import math
from typing import Dict, List, Optional, Sequence, Tuple
from app.config import config
from app.models.champion import Champion
from app.models.draft import ROLES, DraftState
from app.scoring.rank import counter_lambda, lolalytics_tier
from app.scoring.shrink import shrink
from app.scoring.types import Term

Candidate = Tuple[int, float, Optional[float]]  # (champion_id, pick_rate, d2 rétréci ou None)


def opponent_distribution(candidates: Sequence[Candidate], lam_q: float, alpha: float = 1.0) -> Dict[int, float]:
    """Mélange d'un bras méta (ce qui se joue) et d'un bras counter (ce qui punit).

    Le bras counter pondère la menace par le pick rate : l'adversaire prend un
    counter qu'il joue. `alpha` concentre la masse sur les pires matchups.
    """
    total_pr = sum(pr for _, pr, _ in candidates)
    if not candidates or total_pr <= 0:
        return {}
    p_meta = {cid: pr / total_pr for cid, pr, _ in candidates}
    weight = {cid: pr * max(0.0, -(d2 or 0.0)) ** alpha for cid, pr, d2 in candidates}
    total_weight = sum(weight.values())
    p_counter = {cid: w / total_weight for cid, w in weight.items()} if total_weight > 0 else p_meta
    return {cid: (1 - lam_q) * p_meta[cid] + lam_q * p_counter[cid] for cid in p_meta}


def expected_delta(dist: Dict[int, float], deltas: Dict[int, float]) -> Tuple[float, float]:
    value = sum(p * deltas.get(cid, 0.0) for cid, p in dist.items())
    variance = sum(p * (deltas.get(cid, 0.0) - value) ** 2 for cid, p in dist.items())
    return value, max(config.scoring.future_sd_floor, math.sqrt(variance))


def role_identification_probability(champion: Champion, my_role: str, unfilled_roles: set) -> float:
    if len(champion.roles) <= 1 or unfilled_roles == {my_role}:
        return 1.0
    plausible = set(champion.roles) & set(unfilled_roles)
    return 1.0 / max(1, len(plausible))


async def future_opponent_term(matchup, meta, db, champion: Champion, role: str, draft: DraftState,
                               rank: Optional[str]) -> Optional[Term]:
    if draft.my_lane_opponent_revealed or draft.remaining_enemy_picks <= 0:
        return None
    c = config.scoring
    tier = lolalytics_tier(rank, matchup.fetcher.TIER)
    await meta.load_tierlist(role, tier)
    await matchup.load_matchups(champion.id, role, tier=tier)
    counters = matchup.counters(champion.id, role, tier)
    unavailable = draft.all_unavailable_ids
    candidates: List[Candidate] = []
    deltas: Dict[int, float] = {}
    for x in db.champions_for_role(role):
        if x.id == champion.id or x.id in unavailable:
            continue
        stats = meta.stats(x.id, role, tier)
        if stats is None or stats.pick_rate < c.min_opponent_pick_rate:
            continue
        data = counters.get(x.id)
        d2 = shrink(data[3], data[1], c.k_matchup) if data else None
        candidates.append((x.id, stats.pick_rate, d2))
        deltas[x.id] = d2 or 0.0
    if not candidates or not counters:
        return Term("future_opponent", 0.0, c.future_no_data_sd, "heuristic", 0,
                    "aucune page de counters ou de pick rates pour ce rôle")
    unfilled = set(ROLES) - draft.ally_roles_filled
    lam_q = counter_lambda(rank) * role_identification_probability(champion, role, unfilled)
    dist = opponent_distribution(candidates, lam_q)
    value, sd = expected_delta(dist, deltas)
    return Term("future_opponent", value, sd, "observed", sum(counters[cid][1] for cid in dist if cid in counters),
                f"{len(dist)} adversaires possibles, λ={lam_q:.2f}")
