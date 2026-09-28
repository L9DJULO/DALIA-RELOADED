"""Champion-related Pydantic models."""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class DamageProfile(BaseModel):
    """Percentage breakdown of a champion's damage output."""
    physical: float = 50.0
    magical: float = 45.0
    true_dmg: float = 5.0


class DamageDealt(BaseModel):
    """Dégâts infligés aux champions par partie, par type (scripts/refresh_damage.py).

    `measured` faux : estimation (médiane du poste principal répartie selon le type
    Riot ou le profil des tags), faute de mesure.
    """
    physical: float = 0.0
    magic: float = 0.0
    true: float = 0.0
    measured: bool = False

    @property
    def total(self) -> float:
        return self.physical + self.magic + self.true


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
    difficulty: int = Field(5, ge=1, le=10)  # Data Dragon info.difficulty
    tags: List[str] = []              # Riot tags: Fighter, Tank, Mage, Assassin, Marksman, Support
    roles: List[str] = []             # Playable lanes: top, jungle, mid, bot, support
    damage: DamageProfile = DamageProfile()
    ratings: ChampionRatings = ChampionRatings()
    attack_range: int = 550           # Data Dragon stats.attackrange : 125-225 en mêlée, 450+ à distance
    # Propriétés de draft définies et validées par le joueur (docs/TAXONOMIES_CHAMPIONS.md) :
    # les règles lisent une propriété au lieu de nommer des champions (chantier 2).
    properties: List[str] = []
    # Type de dégâts publié par Riot (physical / magic / mixed) : repli quand la mesure manque.
    damage_type: Optional[str] = None
    # Dégâts mesurés (ou estimés) par partie ; `damage` en est la répartition en %.
    damage_dealt: Optional[DamageDealt] = None
    image_url: str = ""

    @property
    def is_melee(self) -> bool:
        """Portée réelle, pas une déduction depuis la tankiness ou le type de dégâts.

        La coupure tombe dans un vide : aucun champion ne se situe entre 225 et 450.
        Samira (500) est à distance malgré un kit qui la force au contact.
        """
        return self.attack_range <= 350

    @property
    def is_ad(self) -> bool:
        return self.damage.physical >= 60

    @property
    def is_ap(self) -> bool:
        return self.damage.magical >= 60

    @property
    def is_tank(self) -> bool:
        """Propriété `tank` du joueur (28/09) : Vanguard, Warden et Juggernaut du wiki.

        Ni le tag Riot Tank ni la tankiness : celle-ci mesure la survie (dash,
        intouchabilité), et faisait de Xayah, Tristana ou Yuumi des tanks.
        """
        return "tank" in self.properties

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
