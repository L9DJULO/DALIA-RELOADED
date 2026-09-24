"""Termes méta : écart du win rate observé à 50 %, rétréci, et popularité du champion sur le poste."""
import math
from typing import Optional
from app.config import config
from app.models.champion import ChampionStats
from app.scoring.shrink import shrink, shrink_sd
from app.scoring.types import Term


def meta_term(stats: Optional[ChampionStats], context_fraction: float = 0.0) -> Term:
    c = config.scoring
    if stats is None or stats.games <= 0:
        # L'ignorance porte sur la quantité pondérée, 0,25·(WR − 50) : son σ aussi (spec §6.3).
        return Term("meta", 0.0, c.no_meta_sd * c.meta_wr_weight, "heuristic", 0, "aucune statistique méta")
    # Symétrique : ramène un champion fort vers zéro comme un champion faible.
    damping = 1.0 - c.meta_context_damping * min(1.0, max(0.0, context_fraction))
    w = c.meta_wr_weight * damping
    return Term("meta", shrink(stats.win_rate - 50.0, stats.games, c.k_meta) * w,
                shrink_sd(stats.games, c.k_meta) * w, "observed", stats.games, stats.patch or "")


def popularity_term(stats: Optional[ChampionStats], role_ref: Optional[float]) -> Optional[Term]:
    """Ce que les joueurs du rang choisissent réellement sur ce poste.

    Le pick rate est un jugement collectif sur la force du champion, que le win
    rate ne donne pas : un champion peu joué a un win rate gonflé par ses joueurs
    dédiés. Lu par poste — Shaco support pèse bien moins que Shaco jungle.

    Ancré sur le pick rate médian du poste (`role_ref`) : un pick médian vaut 0.
    Un zéro arbitraire décalerait tous les candidats d'autant — sans effet sur le
    classement, mais avec une incertitude relative qui gonflerait σ, la confiance
    et le verdict « à égalité ».

    Un champion absent des données du poste n'y est pas joué : il prend le
    plancher, jamais mieux qu'un pick rare. Sans aucune donnée pour le poste
    (`role_ref` absent), le terme n'a pas de référence et n'existe pas.

    Incertitude relative : le pick rate est mesuré sur des millions de parties,
    c'est sa conversion en points de win rate qui est incertaine, et elle est la
    même pour tous les candidats.
    """
    if not role_ref:
        return None
    c = config.scoring
    observed = stats.pick_rate if stats is not None else 0.0
    pick_rate = max(c.popularity_floor, float(observed or 0.0))
    value = c.popularity_scale * math.log(pick_rate / max(c.popularity_floor, role_ref))
    note = (f"pick rate {observed:.1f} % sur le poste, médiane {role_ref:.1f} %" if stats is not None
            else "aucune partie sur le poste")
    return Term("popularity", value, 0.0, "heuristic", stats.games if stats is not None else 0,
                note, rel_sd=c.popularity_rel)
