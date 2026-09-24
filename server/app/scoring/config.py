"""Constantes du scoring en points de win rate (spec 2026-09-10)."""
from typing import Dict
from pydantic import BaseModel


class ScoringConstants(BaseModel):
    # Rétrécissement
    k_meta: int = 500
    k_matchup: int = 200
    no_meta_sd: float = 3.0
    # Signal méta hybride (chantier 13, arbitrage du joueur le 24/09/2026). Le win
    # rate brut classe à l'envers d'un bon drafteur sur la calibration comme sur la
    # concordance pro : le win rate d'un champion peu joué mesure surtout ses
    # joueurs dédiés. Balayage conjoint le 24/09 (gel 16.19.1, master_plus) :
    # (0,25 ; 1,0) est le meilleur point de la calibration, 30 -> 37/52, sans
    # catégorie perdante hors synergy_senna_tahmkench, cas déjà jugé périmé par le
    # joueur. Concordance pro top-3 5,9 -> 15,0 %. La concordance monte encore avec
    # la popularité, mais elle la favorise par construction (la soloqueue copie les
    # pros) ; au-delà de 1,5 la calibration perd des cas de counter. Garder un quart
    # du win rate laisse le moteur réagir à un champion devenu fort en début de patch.
    meta_wr_weight: float = 0.25
    popularity_scale: float = 1.0
    popularity_floor: float = 0.05    # pick rate plancher, en % : borne ln() pour un pick jamais joué
    popularity_rel: float = 0.5
    # Amortissement de la meta par le contexte. Le win rate brut est une moyenne
    # SUR TOUS LES CONTEXTES, y compris ceux ou le champion a ete pique dans une
    # situation favorable. Tant que le contexte reel est inconnu, cette moyenne est
    # la meilleure information disponible ; quand il est connu, continuer a la
    # compter a plein revient a la compter deux fois contre les termes qui, eux,
    # decrivent CETTE partie.
    # Mesure du 24/09 (gel 16.19.1, apres le signal meta calibre) : 0,2 / 0,35 / 0,5
    # perdent tous counter_pick_top_vs_darius et ne gagnent rien. Un win rate deja
    # ramene au quart n'a plus rien a amortir. Retenu : neutre.
    meta_context_damping: float = 0.0
    # Matchup
    offlane_weight: float = 0.5
    heuristic_matchup_scale: float = 0.2
    heuristic_matchup_sd: float = 3.0
    # Poids du duel de couloir selon le rang, en sens inverse de counter_lambda :
    # plus le rang monte, moins la lane decide la partie. Ne s'applique qu'au terme
    # `matchup` ; `future_opponent` porte deja counter_lambda, y superposer un second
    # facteur de rang serait du double comptage. Neutre par defaut, calibre par un
    # facteur d'echelle global — la calibration ne tourne qu'a un rang a la fois et
    # ne saurait pas departager huit valeurs independantes.
    # Mesure du 24/09 (master_plus) : 0,8 / 0,6 / 0,4 perdent toutes
    # counter_pick_top_vs_darius et edge_case_malphite_vs_full_ad, n'en gagnent
    # aucune — les cas de counter ont besoin du duel a plein. Retenu : neutre.
    matchup_weight: Dict[str, float] = {
        "iron": 1.0, "bronze": 1.0, "silver": 1.0, "gold": 1.0,
        "platinum": 1.0, "emerald": 1.0, "diamond": 1.0, "master_plus": 1.0,
    }
    matchup_weight_unknown: float = 1.0
    # Adversaire futur
    min_opponent_pick_rate: float = 0.5
    counter_lambda: Dict[str, float] = {
        "iron": 0.15, "bronze": 0.15, "silver": 0.15, "gold": 0.25, "platinum": 0.25,
        "emerald": 0.35, "diamond": 0.35, "master_plus": 0.50,
    }
    counter_lambda_unknown: float = 0.30
    # Concentration du bras counter. 1.0 = masse proportionnelle à la menace ;
    # au-dessus, la masse se resserre sur les pires matchups. Volontairement
    # indépendant du rang : counter_lambda encode déjà le rang.
    #
    # Balayé sur 1,0 / 1,5 / 2,0 / 2,5 / 3,0 le 17/09/2026, cache gelé, master_plus :
    # score global ET détail par catégorie identiques aux cinq valeurs. La constante
    # est pourtant bien lue — 28 des 38 comparaisons du diagnostic bougent entre 1,0
    # et 3,0 — mais la suite n'a aucun pouvoir de résolution sur ce paramètre. D'où
    # 1,0 : à égalité de preuve, la valeur qui suppose le moins. À rejuger quand la
    # suite saura trancher ces cas.
    counter_alpha: float = 1.0
    future_sd_floor: float = 1.0
    future_no_data_sd: float = 4.0
    # Rang → tier Lolalytics. Buckets vérifiés le 14/09/2026 : Lolalytics ne
    # fournit de bucket `_plus` qu'à partir de gold (silver_plus, bronze_plus
    # et iron_plus répondent 200 avec zéro champion), d'où les buckets exacts
    # en bas de ladder. master_plus est servi par d2_plus : 2,1× plus de
    # parties, population toujours de haut niveau.
    rank_tier_map: Dict[str, str] = {
        "iron": "iron", "bronze": "bronze", "silver": "silver",
        "gold": "gold_plus", "platinum": "platinum_plus",
        "emerald": "emerald_plus", "diamond": "diamond_plus",
        "master_plus": "d2_plus",
    }
    # Maîtrise
    mastery_tier_base: Dict[str, float] = {"S": 1.0, "A": 0.0, "B": -1.5, "C": -3.0, "D": -5.0}
    mastery_personal_min_games: int = 10
    mastery_blend_min_games: int = 3
    mastery_personal_k: int = 10
    mastery_personal_cap: float = 6.0
    mastery_recency_per_month: float = 0.5
    mastery_recency_max_months: int = 3
    mastery_points_familiar: int = 100_000
    mastery_sd_observed: float = 1.0
    mastery_rank_factor: Dict[str, float] = {
        "iron": 1.3, "bronze": 1.3, "silver": 1.3, "gold": 1.0, "platinum": 1.0,
        "emerald": 1.0, "diamond": 0.8, "master_plus": 0.8,
    }
    # Composition marginale
    comp_tool_weights: Dict[str, float] = {
        "frontline": 1.5, "engage": 1.5, "magic_damage": 1.0, "physical_damage": 1.0, "range": 1.0,
        "peel": 1.0, "anti_mobility": 0.5, "anti_tank": 0.5, "anti_attacks": 0.5,
    }
    comp_warning_penalty: Dict[str, float] = {"critical": 2.0, "warning": 1.0}
    comp_cap: float = 4.0
    archetype_scale: float = 15.0
    # Impact en teamfight. Terme permanent et de faible amplitude : un champion
    # qui pese lourd en combat groupe vaut quelque chose dans toutes les parties,
    # pas seulement dans celles qui s'annoncent groupees (arbitrage du joueur,
    # 18/09/2026).
    # Mesure du 24/09 : 0,5 ne bascule rien et reduit l'ecart Zed-Orianna de 1,51 a
    # 0,51 ; 1,0 fait passer Orianna n°1 mais perd comp_full_aa_top_jax. Sur la
    # concordance pro le terme degrade (top-3 15,0 -> 14,0 % a 0,5, z = -3,9). Retenu :
    # neutre, tant que la note teamfight est saturee (69/71 a 4-5 en bot lane) et que
    # les mids sont notes depuis les tags. A re-mesurer apres le rearbitrage.
    teamfight_reference: float = 3.0
    teamfight_scale: float = 0.0
    teamfight_rel: float = 0.5
    # Synergie, mécaniques, modèle
    synergy_scale: float = 0.12
    synergy_cap: float = 3.0
    synergy_duo_factor: float = 1.5
    mechanics_scale: float = 0.3
    model_cap: float = 4.0
    # Agrégation
    confidence_sd_scale: float = 6.0
    wildcard_min_advantage: float = 1.5
    pref_min: float = 0.5
    pref_max: float = 1.5
    # Incertitudes relatives : erreur sur la constante qui convertit chaque
    # facteur en points de win rate. Partagée par tous les candidats, donc
    # elle s'annule dans la comparaison de deux champions.
    mastery_rel: float = 0.4
    comp_rel: float = 0.5
    archetype_rel: float = 0.5
    synergy_rel: float = 0.5
    mechanics_rel: float = 0.5
    model_rel: float = 0.5
