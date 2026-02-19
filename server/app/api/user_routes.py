"""DALIA — User pool & profile routes (DB-backed, auth-protected)."""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import ChampionPoolEntryDB, UserDB
from app.db.session import get_db

logger = logging.getLogger("dalia.api.user")
router = APIRouter(prefix="/user", tags=["user"])


# ── Schemas ──────────────────────────────────────────────────────────────
class PoolEntryIn(BaseModel):
    champion_id: int
    champion_key: str
    tier: str = "B"


class PoolEntryOut(BaseModel):
    champion_id: int
    champion_key: str
    tier: str
    role: str


class PoolUpdateRequest(BaseModel):
    role: str
    entries: List[PoolEntryIn]


class PoolResponse(BaseModel):
    top: List[PoolEntryOut] = []
    jungle: List[PoolEntryOut] = []
    mid: List[PoolEntryOut] = []
    bot: List[PoolEntryOut] = []
    support: List[PoolEntryOut] = []


class ProfileResponse(BaseModel):
    username: str
    champion_pool: PoolResponse
    preferred_roles: list
    enable_wildcard: bool
    enable_off_meta: bool
    weight_overrides: dict | None


# ── Routes ───────────────────────────────────────────────────────────────
@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the authenticated user's full profile with champion pool."""
    pool_entries = await db.execute(
        select(ChampionPoolEntryDB).where(
            ChampionPoolEntryDB.user_id == current_user.id
        )
    )
    entries = pool_entries.scalars().all()

    pool = PoolResponse()
    for e in entries:
        entry = PoolEntryOut(
            champion_id=e.champion_id,
            champion_key=e.champion_key,
            tier=e.tier,
            role=e.role,
        )
        getattr(pool, e.role).append(entry)

    return ProfileResponse(
        username=current_user.username,
        champion_pool=pool,
        preferred_roles=current_user.preferred_roles or ["mid"],
        enable_wildcard=current_user.enable_wildcard,
        enable_off_meta=current_user.enable_off_meta,
        weight_overrides=current_user.weight_overrides,
    )


@router.get("/pool", response_model=PoolResponse)
async def get_pool(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just the champion pool."""
    result = await db.execute(
        select(ChampionPoolEntryDB).where(
            ChampionPoolEntryDB.user_id == current_user.id
        )
    )
    entries = result.scalars().all()

    pool = PoolResponse()
    for e in entries:
        entry = PoolEntryOut(
            champion_id=e.champion_id,
            champion_key=e.champion_key,
            tier=e.tier,
            role=e.role,
        )
        getattr(pool, e.role).append(entry)
    return pool


@router.post("/pool")
async def update_pool(
    body: PoolUpdateRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace champion pool for a single role."""
    role = body.role.lower()
    if role not in ("top", "jungle", "mid", "bot", "support"):
        raise HTTPException(status_code=400, detail=f"Rôle invalide: {role}")

    # Delete existing entries for this role
    await db.execute(
        delete(ChampionPoolEntryDB).where(
            ChampionPoolEntryDB.user_id == current_user.id,
            ChampionPoolEntryDB.role == role,
        )
    )

    # Insert new entries
    for entry in body.entries:
        db.add(
            ChampionPoolEntryDB(
                user_id=current_user.id,
                role=role,
                champion_id=entry.champion_id,
                champion_key=entry.champion_key,
                tier=entry.tier,
            )
        )

    await db.commit()
    return {"status": "updated", "role": role, "count": len(body.entries)}


@router.delete("/pool/{role}/{champion_id}")
async def remove_from_pool(
    role: str,
    champion_id: int,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a single champion from pool for a role."""
    await db.execute(
        delete(ChampionPoolEntryDB).where(
            ChampionPoolEntryDB.user_id == current_user.id,
            ChampionPoolEntryDB.role == role,
            ChampionPoolEntryDB.champion_id == champion_id,
        )
    )
    await db.commit()
    return {"status": "removed", "role": role, "champion_id": champion_id}
