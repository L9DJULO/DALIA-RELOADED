"""DALIA — REST API routes."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import config
from app.models.draft import DraftRequest, DraftResponse, PoolEntry
from app.models.user import UserProfile

logger = logging.getLogger("dalia.api")
router = APIRouter()


# ── Helper ───────────────────────────────────────────────────────────────
def _get_engine(request: Request):
    return request.app.state.draft_engine


def _get_db(request: Request):
    return request.app.state.champion_db


def _get_fetcher(request: Request):
    return request.app.state.fetcher


def _user_path(username: str = "default") -> Path:
    d = Path(config.user_data_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{username}.json"


# ═════════════════════════════════════════════════════════════════════════
#  CHAMPIONS
# ═════════════════════════════════════════════════════════════════════════
class ChampionOut(BaseModel):
    id: int
    key: str
    name: str
    title: str
    tags: list
    roles: list
    image_url: str
    damage_physical: float
    damage_magical: float
    damage_true: float
    primary_damage_type: str


@router.get("/champions", response_model=List[ChampionOut])
async def list_champions(request: Request, role: Optional[str] = None):
    """Return all champions (optionally filtered by role)."""
    db = _get_db(request)
    champs = db.champions_for_role(role) if role else db.all_champions()
    return [
        ChampionOut(
            id=c.id, key=c.key, name=c.name, title=c.title,
            tags=c.tags, roles=c.roles, image_url=c.image_url,
            damage_physical=c.damage.physical,
            damage_magical=c.damage.magical,
            damage_true=c.damage.true_dmg,
            primary_damage_type=c.primary_damage_type,
        )
        for c in sorted(champs, key=lambda x: x.name)
    ]


@router.get("/champions/{champion_id}")
async def get_champion(champion_id: int, request: Request):
    db = _get_db(request)
    c = db.get_by_id(champion_id)
    if not c:
        return {"error": "Champion not found"}
    return c.model_dump()


# ═════════════════════════════════════════════════════════════════════════
#  META / TIER LIST
# ═════════════════════════════════════════════════════════════════════════
@router.get("/meta/tierlist")
async def tierlist(request: Request, role: str = "mid"):
    """Return meta tier list for a role with scores."""
    engine = _get_engine(request)
    scores = await engine.meta.scores_for_role(role)
    db = _get_db(request)
    result = []
    for cid, s in sorted(scores.items(), key=lambda x: -x[1]):
        c = db.get_by_id(cid)
        if c:
            stats = db.get_stats(cid, role)
            result.append({
                "champion_id": cid,
                "champion_key": c.key,
                "champion_name": c.name,
                "image_url": c.image_url,
                "meta_score": s,
                "win_rate": stats.win_rate if stats else 50.0,
                "pick_rate": stats.pick_rate if stats else 0.0,
                "ban_rate": stats.ban_rate if stats else 0.0,
                "games": stats.games if stats else 0,
            })
    return result[:80]


# ═════════════════════════════════════════════════════════════════════════
#  DRAFT RECOMMENDATIONS
# ═════════════════════════════════════════════════════════════════════════
@router.post("/draft/recommend", response_model=DraftResponse)
async def draft_recommend(body: DraftRequest, request: Request):
    """Core endpoint: get champion recommendations for the current draft state."""
    engine = _get_engine(request)
    return await engine.recommend(body)


# ═════════════════════════════════════════════════════════════════════════
#  USER PROFILE
# ═════════════════════════════════════════════════════════════════════════
@router.get("/user/profile")
async def get_profile(username: str = "default"):
    p = _user_path(username)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return UserProfile(username=username).model_dump()


@router.post("/user/profile")
async def save_profile(profile: UserProfile):
    p = _user_path(profile.username)
    p.write_text(profile.model_dump_json(), encoding="utf-8")
    return {"status": "saved", "username": profile.username}


class PoolUpdateRequest(BaseModel):
    username: str = "default"
    role: str
    entries: List[PoolEntry]


@router.post("/user/pool")
async def update_pool(body: PoolUpdateRequest):
    """Update champion pool for a single role."""
    p = _user_path(body.username)
    if p.exists():
        profile = UserProfile(**json.loads(p.read_text(encoding="utf-8")))
    else:
        profile = UserProfile(username=body.username)

    profile.champion_pool[body.role] = body.entries
    p.write_text(profile.model_dump_json(), encoding="utf-8")
    return {"status": "updated", "role": body.role, "count": len(body.entries)}


# ═════════════════════════════════════════════════════════════════════════
#  PATCH INFO
# ═════════════════════════════════════════════════════════════════════════
@router.get("/patch")
async def current_patch(request: Request):
    fetcher = _get_fetcher(request)
    ver = await fetcher.get_ddragon_version()
    patch = await fetcher.get_current_patch()
    return {"version": ver, "patch": patch}
