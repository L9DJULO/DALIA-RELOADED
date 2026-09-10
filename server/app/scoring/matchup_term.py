"""Terme matchup contre les ennemis visibles, espérance sur leurs distributions de rôles."""
from __future__ import annotations
import math
from typing import Optional
from app.config import config
from app.models.draft import DraftState
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term
from app.services.matchup import MatchupAnalyzer


async def matchup_term(analyzer: MatchupAnalyzer, champion_id: int, role: str, draft: DraftState,
                       tier: Optional[str]) -> Optional[Term]:
    enemies = [e for e in draft.enemy_picks if e.champion_id is not None]
    if not enemies:
        return None
    c = config.scoring
    await analyzer.prefetch(champion_id, role, draft, tier)
    value, variance, sample, observed = 0.0, 0.0, 0, 0
    for ep in enemies:
        dist = draft.role_distributions.get(ep.champion_id) if draft.role_distributions else None
        if not dist:
            dist = {ep.role: 1.0} if ep.role else {}
        for opp_role, p in dist.items():
            if p <= 0:
                continue
            is_lane = opp_role == role
            weight = p * (1.0 if is_lane else c.offlane_weight)
            data = await analyzer.matchup_data(champion_id, role, ep.champion_id, opp_role, tier)
            if data is not None:
                _, games, _, d2 = data
                value += weight * shrink(d2, games, c.k_matchup)
                variance += (weight * shrink_sd(games, c.k_matchup)) ** 2
                sample += games
                observed += 1
            else:
                est, _ = analyzer.estimate_matchup(champion_id, ep.champion_id, is_lane)
                value += weight * (est - 50.0) * c.heuristic_matchup_scale
                variance += (weight * c.heuristic_matchup_sd) ** 2
    source = "observed" if observed else "heuristic"
    return Term("matchup", value, math.sqrt(variance), source, sample,
                "" if observed else "estimation de kit, aucune donnée de matchup")
