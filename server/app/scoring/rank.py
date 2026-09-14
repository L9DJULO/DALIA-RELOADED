"""Rang du joueur : normalisation et facteurs dépendant du rang."""
from typing import Optional
from app.config import config
from app.scoring.types import RANKS

_ALIASES = {"master": "master_plus", "grandmaster": "master_plus", "challenger": "master_plus"}


def normalize_rank(value) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    cleaned = _ALIASES.get(cleaned, cleaned)
    return cleaned if cleaned in RANKS else None


def lolalytics_tier(rank: Optional[str], default: Optional[str] = None) -> str:
    """Tier Lolalytics pour un rang ; `default` = tier du fetcher (config.rank_tier sinon)."""
    mapped = config.scoring.rank_tier_map.get(rank) if rank else None
    return mapped or default or config.rank_tier


def counter_lambda(rank: Optional[str]) -> float:
    return config.scoring.counter_lambda.get(rank, config.scoring.counter_lambda_unknown)


def mastery_rank_factor(rank: Optional[str]) -> float:
    return config.scoring.mastery_rank_factor.get(rank, 1.0)
