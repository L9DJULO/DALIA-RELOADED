"""User profile models — champion pool, settings, preferences."""
from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from app.models.draft import PoolEntry


class UserProfile(BaseModel):
    """Persisted user profile (JSON file)."""
    username: str = "default"

    # Champion pool per role — keys are "top", "jungle", "mid", "bot", "support"
    champion_pool: Dict[str, List[PoolEntry]] = Field(default_factory=lambda: {
        "top": [], "jungle": [], "mid": [], "bot": [], "support": []
    })

    # Personal weight preferences (override defaults)
    weight_overrides: Optional[Dict[str, float]] = None

    # Settings
    preferred_roles: List[str] = Field(default_factory=lambda: ["mid"])
    enable_wildcard_suggestions: bool = True
    enable_off_meta: bool = True

    def get_pool_for_role(self, role: str) -> List[PoolEntry]:
        return self.champion_pool.get(role, [])

    def get_all_pool_ids(self) -> set:
        ids = set()
        for entries in self.champion_pool.values():
            for e in entries:
                ids.add(e.champion_id)
        return ids
