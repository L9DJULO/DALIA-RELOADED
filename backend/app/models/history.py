"""Draft history models — persisted draft sessions with result tracking."""
from __future__ import annotations
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class HistoryPick(BaseModel):
    """A pick recorded in history."""
    champion_id: int
    champion_key: str = ""
    champion_name: str = ""
    role: str = ""


class HistoryEntry(BaseModel):
    """A single saved draft session."""
    id: str = ""                        # UUID string
    timestamp: str = ""                 # ISO 8601
    patch: str = ""
    my_team: str = "blue"               # "blue" | "red"
    my_role: str = "mid"
    my_champion_id: Optional[int] = None
    my_champion_key: str = ""
    my_champion_name: str = ""

    # Bans
    ally_bans: List[HistoryPick] = Field(default_factory=list)
    enemy_bans: List[HistoryPick] = Field(default_factory=list)

    # Picks
    ally_picks: List[HistoryPick] = Field(default_factory=list)
    enemy_picks: List[HistoryPick] = Field(default_factory=list)

    # Recommendation used
    recommended_champion: str = ""
    recommendation_score: Optional[float] = None
    win_probability: Optional[float] = None

    # Result
    result: str = ""                    # "win" | "loss" | "remake" | ""
    notes: str = ""

    # Stats
    was_counterpicked: bool = False
    tags: List[str] = Field(default_factory=list)


class HistoryStats(BaseModel):
    """Aggregated statistics from draft history."""
    total_games: int = 0
    wins: int = 0
    losses: int = 0
    remakes: int = 0
    unrecorded: int = 0
    win_rate: float = 0.0
    avg_recommendation_score: float = 0.0
    avg_win_probability: float = 0.0
    most_picked: List[Dict] = Field(default_factory=list)    # [{champion, count, wins}]
    by_role: Dict[str, Dict] = Field(default_factory=dict)   # role -> {games, wins, wr}
    followed_recommendation: int = 0
    followed_recommendation_wins: int = 0
