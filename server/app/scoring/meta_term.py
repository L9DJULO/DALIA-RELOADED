"""Terme méta : écart du win rate observé à 50 %, rétréci."""
from typing import Optional
from app.config import config
from app.models.champion import ChampionStats
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term


def meta_term(stats: Optional[ChampionStats]) -> Term:
    c = config.scoring
    if stats is None or stats.games <= 0:
        return Term("meta", 0.0, c.no_meta_sd, "heuristic", 0, "aucune statistique méta")
    return Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta),
                shrink_sd(stats.games, c.k_meta), "observed", stats.games, stats.patch or "")
