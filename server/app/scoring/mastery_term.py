"""Terme maîtrise : confort réel sur le champion, pondéré par difficulté et rang."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from app.config import config
from app.scoring.rank import mastery_rank_factor
from app.scoring.shrink import shrink
from app.scoring.types import Term


@dataclass
class MasteryInputs:
    tier: str
    difficulty: int
    rank: Optional[str]
    personal_games: int = 0
    personal_wr: Optional[float] = None
    mastery_points: int = 0
    last_played: Optional[datetime] = None
    now: Optional[datetime] = None


def mastery_term(inp: MasteryInputs) -> Term:
    c = config.scoring
    declared = c.mastery_tier_base.get(inp.tier, c.mastery_tier_base["B"])
    g = max(0, inp.personal_games)
    personal = None
    if inp.personal_wr is not None and g >= c.mastery_blend_min_games:
        raw = shrink(inp.personal_wr - 50.0, g, c.mastery_personal_k)
        personal = max(-c.mastery_personal_cap, min(c.mastery_personal_cap, raw))
    if personal is not None and g >= c.mastery_personal_min_games:
        base, sd, source = personal, c.mastery_sd_observed, "observed"
    elif personal is not None:
        base = (g * personal + c.mastery_personal_min_games * declared) / (g + c.mastery_personal_min_games)
        sd, source = c.mastery_sd_declared, "heuristic"
    else:
        base, sd, source = declared, c.mastery_sd_declared, "heuristic"

    penalty = 0.0
    if inp.last_played is not None:
        now = inp.now or datetime.now(timezone.utc)
        months = min(float(c.mastery_recency_max_months), max(0.0, (now - inp.last_played).days / 30.0))
        penalty = c.mastery_recency_per_month * months
        if inp.mastery_points >= c.mastery_points_familiar:
            penalty /= 2
    f_diff = 0.6 + 0.08 * max(1, min(10, inp.difficulty))
    value = (base - penalty) * f_diff * mastery_rank_factor(inp.rank)
    note = f"palier {inp.tier}, difficulté {inp.difficulty}" + (f", {g} parties" if g else "")
    return Term("mastery", value, sd, source, g, note)
