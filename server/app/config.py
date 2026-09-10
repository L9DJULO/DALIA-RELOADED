"""DALIA configuration — constantes de scoring, API URLs, DB settings."""
import os
from pathlib import Path
from typing import Dict
from pydantic import BaseModel
from dotenv import load_dotenv
from app.scoring.config import ScoringConstants

# Load .env from server/ directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent.parent


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
    environment: str = os.getenv("ENV", "production")
    allowed_origins: list[str] = [
        origin.strip() for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost"
        ).split(",") if origin.strip()
    ]
    # ── Database ──
    database_url: str = _build_database_url()

    # ── JWT Auth ──
    jwt_secret: str = os.getenv("JWT_SECRET", "")
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

    # ── Rank / Queue filter (tier Lolalytics par défaut, Ranked Solo) ──
    rank_tier: str = "emerald_plus"
    queue: str = "ranked"
    region: str = "all"

    # ── Scoring (points de win rate) ──
    scoring: ScoringConstants = ScoringConstants()

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
    wildcard_max_suggestions: int = 2


config = Config()


KNOWN_INSECURE_SECRET_HASHES = {'0482f74dcac109e02d5811fac6920228c6e7ca6429af3f22125b49de5fe5f643', '3a5c694ad67eccd627602cda6c4291dafa984dc881afa2def66c7f0d232f2dfd'}

def validate_runtime_config():
    import hashlib
    if (len(config.jwt_secret) < 32 or config.jwt_secret.startswith("CHANGE_ME") or
            hashlib.sha256(config.jwt_secret.encode()).hexdigest() in KNOWN_INSECURE_SECRET_HASHES):
        raise RuntimeError("JWT_SECRET doit contenir un secret privé d'au moins 32 caractères. Voir server/.env.example.")
    if config.jwt_algorithm != "HS256":
        raise RuntimeError("Seul HS256 est pris en charge pour les jetons DALIA.")
