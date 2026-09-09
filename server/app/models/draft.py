"""Draft-state and recommendation models."""
from __future__ import annotations
from typing import Annotated, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.models.validation import Role, Team, Tier, ChampionId, Puuid, Region, validate_weights


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
    champion_id: Optional[ChampionId] = None
    champion_key: Optional[str] = None
    role: Optional[Role] = None          # May be unknown for enemies


class DraftState(BaseModel):
    """Snapshot of the current draft for the recommendation engine."""
    # ── Who am I? ──
    my_team: Team = "blue"
    my_role: Role = "mid"
    my_pick_order: int = Field(default=1, ge=1, le=5)

    # ── Bans ──
    bans: List[ChampionId] = Field(default_factory=list, max_length=10)

    # ── Picks already made ──
    ally_picks: List[DraftPick] = Field(default_factory=list, max_length=5)
    enemy_picks: List[DraftPick] = Field(default_factory=list, max_length=5)

    # ── Ally pre-picks (hover / intent) ──
    # Champions allies are hovering but haven't locked yet.
    # Used to anticipate team composition when picking before allies.
    ally_prepicks: List[DraftPick] = Field(default_factory=list, max_length=5)

    # ── Draft progression ──
    current_action: int = Field(default=0, ge=0, le=19)

    @model_validator(mode="after")
    def coherent_draft(self):
        ids = [p.champion_id for p in self.ally_picks + self.enemy_picks if p.champion_id]
        if len(ids) != len(set(ids)) or set(ids) & set(self.bans):
            raise ValueError("Un champion ne peut être sélectionné deux fois ou être à la fois banni et sélectionné")
        for picks in (self.ally_picks, self.enemy_picks):
            roles = [p.role for p in picks if p.role]
            if len(roles) != len(set(roles)):
                raise ValueError("Un rôle ne peut être attribué deux fois dans une équipe")
        return self

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
    mechanics: float = 0.0
    wpa_adjustment: float = 0.0


class MatchupDetail(BaseModel):
    opponent_name: str
    opponent_role: str
    win_rate: Optional[float] = None
    delta: float
    is_lane_opponent: bool = False
    games: int = 0
    source: str = "heuristic"
    lane_probability: float = 0


class SynergyDetail(BaseModel):
    ally_name: str
    ally_role: str
    delta: float
    source: str = "kit_heuristic"


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
    meta_window: Optional[str] = None
    meta_games: int = 0                 # total games played in role (30d) — sample size indicator
    verdict: str = ""                   # short 1-line summary ("Counter direct Syndra. Attention engage.")
    reasons: List[Reason] = Field(default_factory=list)  # 3 max, contextual, champion-aware
    mechanics: List[dict] = Field(default_factory=list)
    wpa: Optional[dict] = None


class PoolEntry(BaseModel):
    champion_id: ChampionId
    champion_key: str = ""
    tier: Tier = "B"


AnnotatedPool = Annotated[List[PoolEntry], Field(max_length=200)]


class DraftRequest(BaseModel):
    """Request body for /api/draft/recommend."""
    draft_state: DraftState
    champion_pool: Dict[Role, AnnotatedPool] = Field(default_factory=dict)
    weight_overrides: Optional[Dict[str, float]] = None
    # ── DuoQ ──
    duo_active: bool = False
    duo_partner_role: Optional[Role] = None
    duo_partner_pool: Optional[Dict[Role, AnnotatedPool]] = None
    enable_wildcard: bool = True
    enable_off_meta: bool = True
    # ── Personal stats (from LCU link) ──
    puuid: Optional[Puuid] = None
    region: Optional[Region] = None

    _weights_valid = field_validator("weight_overrides")(validate_weights)

    @field_validator("champion_pool", "duo_partner_pool")
    @classmethod
    def unique_pool(cls, pool):
        for entries in (pool or {}).values():
            if len({e.champion_id for e in entries}) != len(entries):
                raise ValueError("Un champion apparaît deux fois dans le pool")
        return pool


class BanSuggestion(BaseModel):
    """A champion to ban — counters user pool or threatens allied comp."""
    champion_id: int
    champion_key: str
    champion_name: str
    severity: float = 0.0          # 0-100 — how much should we want this banned
    reason: str = ""               # short tag-line shown in UI
    counters_pool: List[str] = Field(default_factory=list)  # pool champion names countered
    threatens_allies: List[str] = Field(default_factory=list)  # ally names threatened


class BanImpact(BaseModel):
    """Impact of a ban on the current recommendation scores."""
    champion_id: int
    champion_name: str
    champion_key: str = ""
    meta_score: float = 0.0       # Meta strength of the banned champion (0-100)
    is_lane_threat: bool = False   # True if meta_score >= 65 for the player's role
    helped_recommendations: List[str] = Field(default_factory=list)  # Rec names that benefit


class DraftResponse(BaseModel):
    recommendations: List[Recommendation]
    team_composition_summary: Dict[str, float] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    win_probability: Optional[float] = None  # 0-100, from ML model
    duo_synergy_boost: bool = False  # True when DuoQ mode was active for recommendations
    ban_suggestions: List[BanSuggestion] = Field(default_factory=list)
    ban_impact: List[BanImpact] = Field(default_factory=list)
    data_status: dict = Field(default_factory=dict)


class CompareRequest(DraftRequest):
    champion_ids: List[ChampionId] = Field(min_length=2, max_length=2)

    @field_validator("champion_ids")
    @classmethod
    def distinct_champions(cls, ids):
        if ids[0] == ids[1]:
            raise ValueError("Choisis deux champions différents")
        return ids


class PoolAdviceRequest(BaseModel):
    role: Role
    champion_pool: Dict[Role, AnnotatedPool] = Field(default_factory=dict)
