"""Termes méta : écart du win rate observé à 50 %, rétréci, et popularité du champion sur le poste."""
import math
from typing import Optional
from app.config import config
from app.models.champion import ChampionStats
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term


def meta_term(stats: Optional[ChampionStats]) -> Term:
    c = config.scoring
    if stats is None or stats.games <= 0:
        return Term("meta", 0.0, c.no_meta_sd, "heuristic", 0, "aucune statistique méta")
    w = c.meta_wr_weight
    return Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta) * w,
                shrink_sd(stats.games, c.k_meta) * w, "observed", stats.games, stats.patch or "")


def popularity_term(stats: Optional[ChampionStats]) -> Optional[Term]:
    """Ce que les joueurs du rang choisissent réellement sur ce poste.

    Le pick rate est un jugement collectif sur la force du champion, que le win
    rate ne donne pas : un champion peu joué a un win rate gonflé par ses joueurs
    dédiés. Lu par poste — Shaco support pèse bien moins que Shaco jungle.

    Incertitude relative : le pick rate est mesuré sur des millions de parties,
    c'est sa conversion en points de win rate qui est incertaine, et elle est la
    même pour tous les candidats.
    """
    if stats is None:
        return None
    c = config.scoring
    pick_rate = max(c.popularity_floor, float(stats.pick_rate or 0.0))
    value = c.popularity_scale * math.log(pick_rate / c.popularity_ref)
    return Term("popularity", value, 0.0, "heuristic", stats.games,
                f"pick rate {stats.pick_rate:.1f} % sur le poste", rel_sd=c.popularity_rel)
