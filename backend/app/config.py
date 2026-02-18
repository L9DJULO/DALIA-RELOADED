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
    meta: float = 0.12          # ↑ slightly increased — meta strength matters
    matchup: float = 0.33       # ↓ slightly reduced — still most important
    synergy: float = 0.05       # unchanged
    composition: float = 0.15   # unchanged — comp matters
    mastery: float = 0.20       # ↓ reduced from 0.25 — less pool favoritism
    draft_risk: float = 0.08    # ↑ increased — draft context matters more


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

    # ── Sample-size filter (30-day window) ──
    # Champions below this threshold are excluded from wildcards and heavily
    # penalised in meta score because their stats are unreliable.
    min_games_reliable: int = 5_000      # below → heavy penalty / excluded from wildcards
    min_games_full_confidence: int = 50_000  # above → no penalty at all

    # ── Counter / matchup data uses 30-day window for better coverage ──
    counter_patch: str = "30"  # "30" = last 30 days (more data for cross-lane matchups)

    # ── User data persistence ──
    user_data_dir: str = str(BASE_DIR / "app" / "data" / "users")

    # ── Wild-card / off-meta suggestion ──
    wildcard_min_score: float = 60.0  # ↑ increased from 50 - stricter to avoid bad suggestions
    wildcard_max_suggestions: int = 2  # ↓ reduced from 3


config = Config()
