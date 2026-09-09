"""Bounded, versioned snapshots accepted from the client."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, Field, model_validator
from app.models.validation import Role, Team, ChampionId
from app.models.draft import DraftState

ROLES = ("top", "jungle", "mid", "bot", "support")


class ReplayChampion(BaseModel):
    id: ChampionId
    key: str = Field(max_length=50)
    name: str = Field(max_length=100)


Slots = Annotated[list[ReplayChampion | None], Field(min_length=5, max_length=5)]


class ReplayState(BaseModel):
    myTeam: Team
    myRole: Role
    myPickOrder: int = Field(ge=1, le=5)
    currentAction: int = Field(ge=0, le=19)
    autoDetected: bool = False
    blueBans: Slots
    redBans: Slots
    enemyPicks: Slots
    allyPicks: dict[Role, ReplayChampion | None]
    allyPrepicks: dict[Role, ReplayChampion | None]

    @model_validator(mode="after")
    def coherent(self):
        if set(self.allyPicks) != set(ROLES) or set(self.allyPrepicks) != set(ROLES):
            raise ValueError("Cinq rôles alliés requis")
        DraftState(my_team=self.myTeam, my_role=self.myRole,
                   bans=[c.id for c in self.blueBans + self.redBans if c],
                   ally_picks=[{"champion_id": c.id, "role": role} for role, c in self.allyPicks.items() if c],
                   enemy_picks=[{"champion_id": c.id} for c in self.enemyPicks if c])
        return self


class ReplayStep(BaseModel):
    at: datetime
    state: ReplayState
