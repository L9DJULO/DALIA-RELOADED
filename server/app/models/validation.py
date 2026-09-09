"""Shared public input contracts."""
from typing import Annotated, Literal
from pydantic import Field

Role = Literal["top", "jungle", "mid", "bot", "support"]
Team = Literal["blue", "red"]
Tier = Literal["S", "A", "B", "C", "D"]
Result = Literal["win", "loss", "remake"]
ChampionId = Annotated[int, Field(gt=0, le=10000)]
Puuid = Annotated[str, Field(min_length=10, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]
Region = Literal["EUW1", "EUN1", "TR1", "RU", "NA1", "BR1", "LA1", "LA2", "KR", "JP1", "OC1", "PH2", "SG2", "TH2", "TW2", "VN2", "ME1"]
WEIGHT_NAMES = {"meta", "matchup", "synergy", "composition", "mastery", "draft_risk"}

def validate_weights(weights):
    import math
    if weights is not None:
        if set(weights) - WEIGHT_NAMES:
            raise ValueError("Poids inconnu")
        if any(not math.isfinite(v) or not 0 <= v <= 1 for v in weights.values()):
            raise ValueError("Les poids doivent être finis et compris entre 0 et 1")
        if weights and not any(weights.values()):
            raise ValueError("Au moins un poids doit être positif")
    return weights
