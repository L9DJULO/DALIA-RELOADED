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

    # ── Ally pre-picks (hover / intent) ──
    # Champions allies are hovering but haven't locked yet.
    # Used to anticipate team composition when picking before allies.
    ally_prepicks: List[DraftPick] = Field(default_factory=list)

    # ── Draft progression ──
    current_action: int = 0             # 0-19 index in DRAFT_SEQUENCE

    # ── Probabilistic enemy role inference ──
    # Populated by role_inference.infer_enemy_roles() at the start of
    # recommend(). Maps enemy champion_id → {role: probability}. Used by
    # matchup analyzer for weighted matchup scoring and by reasons.py to
    # gate "Lane favorable" wording when role is uncertain.
    role_distributions: Dict[int, Dict[str, float]] = Field(default_factory=dict)

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
    def ally_picks_with_prepicks(self) -> List["DraftPick"]:
        """Ally picks + prepicks for roles not yet locked.
        Prepicks fill roles that aren't already confirmed."""
        filled_roles = self.ally_roles_filled
        combined = list(self.ally_picks)
        for pp in self.ally_prepicks:
            if pp.role and pp.role not in filled_roles and pp.champion_id:
                combined.append(pp)
                filled_roles.add(pp.role)
        return combined

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


class Reason(BaseModel):
    """Contextual, champion-specific explanation for a recommendation.

    `kind` drives the bullet colour in the UI:
      - "synergy" → green / ⟳
      - "counter" → red / ⚔
      - "warning" → orange / !
      - "info"    → neutral / ▸
    `champions` holds the concrete names mentioned in `text` so the UI
    (or downstream consumers) can highlight / link them.
    """
    text: str
    kind: str = "info"
    champions: List[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    """A single champion recommendation returned by the draft engine."""
    champion_id: int
    champion_key: str
    champion_name: str
    total_score: float
    score_range: Optional[List[float]] = None   # [low, high] confidence interval (±X)
    breakdown: ScoreBreakdown
    matchup_details: List[MatchupDetail] = Field(default_factory=list)
    synergy_details: List[SynergyDetail] = Field(default_factory=list)
    composition_warnings: List[CompositionWarning] = Field(default_factory=list)
    is_pool_champion: bool = True
    tags: List[str] = Field(default_factory=list)  # "safe-blind", "counter-pick", "off-meta", "flex"
    confidence: float = 50.0            # 0-100 how confident the engine is
    meta_games: int = 0                 # total games played in role (30d) — sample size indicator
    verdict: str = ""                   # short 1-line summary ("Counter direct Syndra. Attention engage.")
    reasons: List[Reason] = Field(default_factory=list)  # 3 max, contextual, champion-aware


class PoolEntry(BaseModel):
    champion_id: int
    champion_key: str = ""
    tier: str = "B"                     # S / A / B / C / D


class DraftRequest(BaseModel):
    """Request body for /api/draft/recommend."""
    draft_state: DraftState
    champion_pool: Dict[str, List[PoolEntry]] = Field(default_factory=dict)
    weight_overrides: Optional[Dict[str, float]] = None
    # ── DuoQ ──
    duo_active: bool = False
    duo_partner_role: Optional[str] = None  # partner's role ("top", "jungle", etc.)
    duo_partner_pool: Optional[Dict[str, List[PoolEntry]]] = None  # partner's champion pool
    # ── Personal stats (from LCU link) ──
    puuid: Optional[str] = None       # player's Riot PUUID (from LCU)
    region: Optional[str] = None      # platform region (e.g. "EUW1")


class BanSuggestion(BaseModel):
    """A champion to ban — counters user pool or threatens allied comp."""
    champion_id: int
    champion_key: str
    champion_name: str
    severity: float = 0.0          # 0-100 — how much should we want this banned
    reason: str = ""               # short tag-line shown in UI
    counters_pool: List[str] = Field(default_factory=list)  # pool champion names countered
    threatens_allies: List[str] = Field(default_factory=list)  # ally names threatened


class DraftResponse(BaseModel):
    recommendations: List[Recommendation]
    team_composition_summary: Dict[str, float] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    win_probability: Optional[float] = None  # 0-100, from ML model
    duo_synergy_boost: bool = False  # True when DuoQ mode was active for recommendations
    ban_suggestions: List[BanSuggestion] = Field(default_factory=list)
