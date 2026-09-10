"""Constantes du scoring en points de win rate (spec 2026-09-10)."""
from typing import Dict
from pydantic import BaseModel


class ScoringConstants(BaseModel):
    # Rétrécissement
    k_meta: int = 500
    k_matchup: int = 200
    no_meta_sd: float = 3.0
    # Matchup
    offlane_weight: float = 0.5
    heuristic_matchup_scale: float = 0.2
    heuristic_matchup_sd: float = 3.0
    # Adversaire futur
    min_opponent_pick_rate: float = 0.5
    counter_lambda: Dict[str, float] = {
        "iron": 0.15, "bronze": 0.15, "silver": 0.15, "gold": 0.25, "platinum": 0.25,
        "emerald": 0.35, "diamond": 0.35, "master_plus": 0.50,
    }
    counter_lambda_unknown: float = 0.30
    future_sd_floor: float = 1.0
    future_no_data_sd: float = 4.0
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
    mastery_sd_declared: float = 1.5
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
    comp_sd: float = 2.0
    archetype_scale: float = 15.0
    archetype_sd: float = 1.5
    # Synergie, mécaniques, modèle
    synergy_scale: float = 0.12
    synergy_cap: float = 3.0
    synergy_duo_factor: float = 1.5
    synergy_sd: float = 2.0
    mechanics_scale: float = 0.3
    mechanics_sd: float = 1.5
    model_cap: float = 4.0
    model_sd: float = 2.0
    # Agrégation
    confidence_sd_scale: float = 6.0
    wildcard_min_advantage: float = 1.5
    pref_min: float = 0.5
    pref_max: float = 1.5
