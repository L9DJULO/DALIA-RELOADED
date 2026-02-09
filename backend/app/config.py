"""DALIA configuration — scoring weights, API URLs, cache settings."""
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent


class ScoringWeights(BaseModel):
    """Weights used by the draft engine to combine sub-scores (must sum to ~1.0)."""
    meta: float = 0.12
    matchup: float = 0.40
    synergy: float = 0.10
    composition: float = 0.15
    mastery: float = 0.08
    draft_risk: float = 0.15


class Config(BaseModel):
    # ── External data sources ──
    ddragon_url: str = "https://ddragon.leagueoflegends.com"
    lolalytics_base: str = "https://a1.lolalytics.com"

    # ── Cache ──
    cache_dir: str = str(BASE_DIR / "app" / "data" / "cache")
    cache_ttl_hours: int = 6

    # ── Rank / Queue filter (Diamond 2+ Ranked Solo) ──
    rank_tier: str = "d2_plus"
    queue: str = "ranked"
    region: str = "all"

    # ── Scoring ──
    weights: ScoringWeights = ScoringWeights()

    # ── Patch blending (handle low sample sizes on new patches) ──
    min_games_threshold: int = 100
    patch_blend_current_weight: float = 0.7

    # ── Counter / matchup data uses 30-day window for better coverage ──
    counter_patch: str = "30"  # "30" = last 30 days (more data for cross-lane matchups)

    # ── User data persistence ──
    user_data_dir: str = str(BASE_DIR / "app" / "data" / "users")

    # ── Wild-card / off-meta suggestion ──
    wildcard_min_score: float = 50.0  # minimum score to suggest off-pool champ
    wildcard_max_suggestions: int = 3


config = Config()
