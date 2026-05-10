"""DALIA configuration — scoring weights, API URLs, DB settings."""
import os
from pathlib import Path
from typing import Dict
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from server/ directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent


class ScoringWeights(BaseModel):
    """Weights used by the draft engine to combine sub-scores (must sum to ~1.0)."""
    meta: float = 0.07
    matchup: float = 0.47
    synergy: float = 0.07
    composition: float = 0.13
    mastery: float = 0.17
    draft_risk: float = 0.08


class RoleWeightMultipliers(BaseModel):
    """Per-role multipliers applied to matchup, synergy, and composition weights.

    They do not need to sum to any target — they tilt relative importance
    within the same base formula without re-normalising. The post-scoring
    ceiling normalization in recommend() absorbs any global scale shift.

    Design intent:
      TOP     — long 1v1 duel, few team interactions → matchup + comp matter more
      JUNGLE  — team enabler, ganks everywhere → synergy + comp matter more
      MID     — short lane + roaming → matchup slightly boosted
      BOT     — ADC scales with team; duo-lane synergy is everything
      SUPPORT — pure team role; lane matchup much less relevant than comp/synergy
    """
    matchup: float = 1.0
    synergy: float = 1.0
    composition: float = 1.0


def _build_database_url() -> str:
    """Build the async database URL from env, handling Railway/Render postgres:// format."""
    raw = os.getenv("DATABASE_URL", "postgresql+asyncpg://dalia:dalia@localhost:5432/dalia")
    # Railway/Render may provide postgres:// or postgresql:// — convert to asyncpg
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql+asyncpg://", 1)
    elif raw.startswith("postgresql://"):
        raw = raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


class Config(BaseModel):
    # ── Database ──
    database_url: str = _build_database_url()

    # ── JWT Auth ──
    jwt_secret: str = os.getenv("JWT_SECRET", "CHANGE_ME_TO_A_RANDOM_SECRET_KEY")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

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

    # ── Role-specific weight multipliers ──
    # Applied after blind-pick redistribution and pick-order shaping,
    # immediately before the weighted base is computed.
    role_weight_multipliers: Dict[str, RoleWeightMultipliers] = {
        "top":     RoleWeightMultipliers(matchup=1.20, synergy=1.00, composition=1.10),
        "jungle":  RoleWeightMultipliers(matchup=1.00, synergy=1.15, composition=1.20),
        "mid":     RoleWeightMultipliers(matchup=1.15, synergy=1.00, composition=1.00),
        "bot":     RoleWeightMultipliers(matchup=1.00, synergy=1.25, composition=1.00),
        "support": RoleWeightMultipliers(matchup=0.90, synergy=1.30, composition=1.15),
    }

    # ── Patch blending ──
    min_games_threshold: int = 100
    patch_blend_current_weight: float = 0.7

    # ── Sample-size filter ──
    min_games_reliable: int = 5_000
    min_games_full_confidence: int = 50_000

    # ── Counter / matchup data ──
    counter_patch: str = "30"

    # ── User data (legacy fallback) ──
    user_data_dir: str = str(BASE_DIR / "app" / "data" / "users")

    # ── Wild-card ──
    wildcard_min_score: float = 60.0
    wildcard_max_suggestions: int = 2


config = Config()
