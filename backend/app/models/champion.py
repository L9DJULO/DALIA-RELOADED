"""Champion-related Pydantic models."""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class DamageProfile(BaseModel):
    """Percentage breakdown of a champion's damage output."""
    physical: float = 50.0
    magical: float = 45.0
    true_dmg: float = 5.0


class ChampionRatings(BaseModel):
    """Gameplay attribute ratings (1-5 scale)."""
    cc: int = Field(3, ge=1, le=5, description="Crowd-control strength")
    engage: int = Field(3, ge=1, le=5, description="Engage / initiation")
    poke: int = Field(2, ge=1, le=5, description="Poke / long-range harass")
    splitpush: int = Field(3, ge=1, le=5, description="Split push potential")
    teamfight: int = Field(3, ge=1, le=5, description="Teamfight impact")
    utility: int = Field(2, ge=1, le=5, description="Shields, heals, buffs, vision")
    burst: int = Field(3, ge=1, le=5, description="Burst damage")
    dps: int = Field(3, ge=1, le=5, description="Sustained DPS")
    tankiness: int = Field(2, ge=1, le=5, description="Innate tankiness / frontline")


class Champion(BaseModel):
    """Full champion record used throughout the application."""
    id: int                           # Riot numeric key (e.g. 266 for Aatrox)
    key: str                          # Riot string key (e.g. "Aatrox")
    name: str                         # Display name
    title: str = ""
    tags: List[str] = []              # Riot tags: Fighter, Tank, Mage, Assassin, Marksman, Support
    roles: List[str] = []             # Playable lanes: top, jungle, mid, bot, support
    damage: DamageProfile = DamageProfile()
    ratings: ChampionRatings = ChampionRatings()
    image_url: str = ""

    @property
    def is_ad(self) -> bool:
        return self.damage.physical >= 60

    @property
    def is_ap(self) -> bool:
        return self.damage.magical >= 60

    @property
    def is_tank(self) -> bool:
        return "Tank" in self.tags or self.ratings.tankiness >= 4

    @property
    def primary_damage_type(self) -> str:
        if self.damage.physical >= 60:
            return "AD"
        if self.damage.magical >= 60:
            return "AP"
        return "Mixed"


class ChampionStats(BaseModel):
    """Aggregated stats for a champion in a given role (from Lolalytics / scraping)."""
    champion_id: int
    role: str
    win_rate: float = 50.0            # %
    pick_rate: float = 1.0            # %
    ban_rate: float = 0.0             # %
    games: int = 0
    tier: Optional[str] = None        # S / A / B / C / D (site tier)
    patch: str = ""


class MatchupData(BaseModel):
    """Win-rate of champion_id vs opponent_id when they are in the same role."""
    champion_id: int
    opponent_id: int
    role: str
    win_rate: float = 50.0            # champion_id perspective
    games: int = 0
    delta: float = 0.0                # Δ from champion's average WR


class SynergyData(BaseModel):
    """Win-rate delta when champion_id and ally_id are on the same team."""
    champion_id: int
    ally_id: int
    champion_role: str
    ally_role: str
    win_rate: float = 50.0
    games: int = 0
    delta: float = 0.0
