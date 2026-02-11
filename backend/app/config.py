"""DALIA configuration — scoring weights, API URLs, cache settings."""
import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from backend/ directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent


class ScoringWeights(BaseModel):
    """Weights used by the draft engine to combine sub-scores (must sum to ~1.0)."""
    meta: float = 0.18          # ↑ increased from 0.12 - meta matters more
    matchup: float = 0.45       # ↑ increased from 0.40 - matchups are king
    synergy: float = 0.05       # ↓ decreased from 0.10 - synergy overrated
    composition: float = 0.12   # slightly reduced
    mastery: float = 0.08       # unchanged
    draft_risk: float = 0.07    # ↓ decreased from 0.15 - less weight on blind pick risk


class Config(BaseModel):
    # ── Riot API ──
    riot_api_key: str = os.getenv("RIOT_API_KEY", "")
    riot_platform: str = os.getenv("RIOT_PLATFORM", "euw1")

    # ── External data sources ──
    ddragon_url: str = "https://ddragon.leagueoflegends.com"
    lolalytics_base: str = "https://a1.lolalytics.com"

    # ── Cache ──
    cache_dir: str = str(BASE_DIR / "app" / "data" / "cache")
    cache_ttl_hours: int = 6

    # ── Rank / Queue filter (Master+ Ranked Solo) ──
    rank_tier: str = "master_plus"
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
    wildcard_min_score: float = 60.0  # ↑ increased from 50 - stricter to avoid bad suggestions
    wildcard_max_suggestions: int = 2  # ↓ reduced from 3


config = Config()
