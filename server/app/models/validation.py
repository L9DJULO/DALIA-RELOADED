"""Shared public input contracts."""
from typing import Annotated, Literal
from pydantic import BeforeValidator, Field

Role = Literal["top", "jungle", "mid", "bot", "support"]
Team = Literal["blue", "red"]
Tier = Literal["S", "A", "B", "C", "D"]
Result = Literal["win", "loss", "remake"]
ChampionId = Annotated[int, Field(gt=0, le=10000)]
Puuid = Annotated[str, Field(min_length=10, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]

# The League client reports short region names ("EUW", "NA", "EUNE"), the Riot API
# wants platform ids ("EUW1", "NA1", "EUN1"). Accept both, store the platform id.
REGION_ALIASES = {
    "EUW": "EUW1", "EUNE": "EUN1", "NA": "NA1", "BR": "BR1", "LAN": "LA1", "LAS": "LA2",
    "OCE": "OC1", "OC": "OC1", "TR": "TR1", "JP": "JP1", "PH": "PH2", "SG": "SG2",
    "TH": "TH2", "TW": "TW2", "VN": "VN2", "ME": "ME1", "PBE": "PBE1",
}


def normalize_region(value):
    if isinstance(value, str):
        cleaned = value.strip().upper()
        return REGION_ALIASES.get(cleaned, cleaned)
    return value


Region = Annotated[
    Literal["EUW1", "EUN1", "TR1", "RU", "NA1", "BR1", "LA1", "LA2", "KR", "JP1", "OC1", "PH2", "SG2", "TH2", "TW2", "VN2", "ME1"],
    BeforeValidator(normalize_region),
]
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
