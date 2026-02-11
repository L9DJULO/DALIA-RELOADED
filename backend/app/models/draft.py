"""Draft-state and recommendation models."""
from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


ROLES = ["top", "jungle", "mid", "bot", "support"]

# LoL Ranked Draft order (1-indexed actions)
# Blue = team 0, Red = team 1
# Phase 1 Bans: B R B R B R  (actions 1-6)
# Phase 1 Picks: B R R B B R  (actions 7-12)
# Phase 2 Bans: R B R B       (actions 13-16)
# Phase 2 Picks: R B B R      (actions 17-20)

DRAFT_SEQUENCE = [
    # (action_type, team)
    ("ban", "blue"), ("ban", "red"), ("ban", "blue"), ("ban", "red"), ("ban", "blue"), ("ban", "red"),
    ("pick", "blue"), ("pick", "red"), ("pick", "red"), ("pick", "blue"), ("pick", "blue"), ("pick", "red"),
    ("ban", "red"), ("ban", "blue"), ("ban", "red"), ("ban", "blue"),
    ("pick", "red"), ("pick", "blue"), ("pick", "blue"), ("pick", "red"),
]


class DraftPick(BaseModel):
    """A single pick in the draft."""
    champion_id: Optional[int] = None
    champion_key: Optional[str] = None
    role: Optional[str] = None          # May be unknown for enemies


class DraftState(BaseModel):
    """Snapshot of the current draft for the recommendation engine."""
    # ── Who am I? ──
    my_team: str = "blue"               # "blue" | "red"
    my_role: str = "mid"                # top / jungle / mid / bot / support
    my_pick_order: int = 1              # 1-5 within my team

    # ── Bans ──
    bans: List[int] = Field(default_factory=list)

    # ── Picks already made ──
    ally_picks: List[DraftPick] = Field(default_factory=list)
    enemy_picks: List[DraftPick] = Field(default_factory=list)

    # ── Draft progression ──
    current_action: int = 0             # 0-19 index in DRAFT_SEQUENCE

    # ── Helpers ──
    @property
    def all_picked_ids(self) -> set:
        ids = set()
        for p in self.ally_picks + self.enemy_picks:
            if p.champion_id is not None:
                ids.add(p.champion_id)
        return ids

    @property
    def all_unavailable_ids(self) -> set:
        return self.all_picked_ids | set(self.bans)

    @property
    def enemy_roles_revealed(self) -> set:
        return {p.role for p in self.enemy_picks if p.role}

    @property
    def ally_roles_filled(self) -> set:
        return {p.role for p in self.ally_picks if p.role}

    @property
    def remaining_enemy_picks(self) -> int:
        return 5 - len(self.enemy_picks)

    @property
    def my_lane_opponent_revealed(self) -> bool:
        return self.my_role in self.enemy_roles_revealed

    @property
    def is_last_pick(self) -> bool:
        return self.remaining_enemy_picks == 0

    def get_lane_opponent(self) -> Optional[int]:
        for p in self.enemy_picks:
            if p.role == self.my_role and p.champion_id is not None:
                return p.champion_id
        return None


class MLExplanation(BaseModel):
    """Human-readable explanation for the ML prediction."""
    win_probability: float = 0.5         # calibrated (temperature-scaled)
    win_probability_raw: float = 0.5     # raw model output (often extreme)
    confidence: str = "low"              # "low" | "medium" | "high"
    known_champions: int = 0
    champion_games: int = 0              # how many training games for this champ
    reasons: List[str] = Field(default_factory=list)


class ScoreBreakdown(BaseModel):
    """Detailed score breakdown for a champion recommendation."""
    meta: float = 0.0
    matchup: float = 0.0
    synergy: float = 0.0
    composition: float = 0.0
    mastery: float = 0.0
    draft_risk: float = 0.0
    ml_prediction: Optional[float] = None
    ml_explanation: Optional[MLExplanation] = None


class MatchupDetail(BaseModel):
    opponent_name: str
    opponent_role: str
    win_rate: float
    delta: float
    is_lane_opponent: bool = False
    games: int = 0


class SynergyDetail(BaseModel):
    ally_name: str
    ally_role: str
    delta: float


class CompositionWarning(BaseModel):
    severity: str = "warning"           # "warning" | "critical"
    message: str = ""


class Recommendation(BaseModel):
    """A single champion recommendation returned by the draft engine."""
    champion_id: int
    champion_key: str
    champion_name: str
    total_score: float
    breakdown: ScoreBreakdown
    matchup_details: List[MatchupDetail] = Field(default_factory=list)
    synergy_details: List[SynergyDetail] = Field(default_factory=list)
    composition_warnings: List[CompositionWarning] = Field(default_factory=list)
    is_pool_champion: bool = True
    tags: List[str] = Field(default_factory=list)  # "safe-blind", "counter-pick", "off-meta", "flex"
    confidence: float = 50.0            # 0-100 how confident the engine is


class PoolEntry(BaseModel):
    champion_id: int
    champion_key: str = ""
    tier: str = "B"                     # S / A / B / C / D


class DraftRequest(BaseModel):
    """Request body for /api/draft/recommend."""
    draft_state: DraftState
    champion_pool: Dict[str, List[PoolEntry]] = Field(default_factory=dict)
    weight_overrides: Optional[Dict[str, float]] = None


class DraftResponse(BaseModel):
    recommendations: List[Recommendation]
    team_composition_summary: Dict[str, float] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
