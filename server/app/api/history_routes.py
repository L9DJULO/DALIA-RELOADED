"""DALIA — Draft history routes (DB-backed, auth-protected)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.models import DraftHistoryDB, UserDB
from app.db.session import get_db

logger = logging.getLogger("dalia.api.history")
router = APIRouter(prefix="/history", tags=["history"])


# ── Schemas ──────────────────────────────────────────────────────────────
class HistoryEntryIn(BaseModel):
    patch: Optional[str] = None
    my_team: Optional[str] = None
    my_role: Optional[str] = None
    my_champion_id: Optional[int] = None
    my_champion_key: Optional[str] = None
    my_champion_name: Optional[str] = None
    ally_picks: list = []
    enemy_picks: list = []
    ally_bans: list = []
    enemy_bans: list = []
    recommended_champion: Optional[str] = None
    recommendation_score: Optional[float] = None
    win_probability: Optional[float] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    tags: list = []


class HistoryEntryOut(BaseModel):
    id: UUID
    timestamp: datetime
    patch: Optional[str]
    my_team: Optional[str]
    my_role: Optional[str]
    my_champion_id: Optional[int]
    my_champion_key: Optional[str]
    my_champion_name: Optional[str]
    ally_picks: list
    enemy_picks: list
    ally_bans: list
    enemy_bans: list
    recommended_champion: Optional[str]
    recommendation_score: Optional[float]
    win_probability: Optional[float]
    result: Optional[str]
    notes: Optional[str]
    tags: list

    class Config:
        from_attributes = True


class HistoryResultUpdate(BaseModel):
    result: str  # "win" | "loss" | "remake"
    notes: str = ""


class HistoryStatsOut(BaseModel):
    total_games: int
    wins: int
    losses: int
    remakes: int
    unrecorded: int
    win_rate: float
    avg_recommendation_score: float
    avg_win_probability: float
    most_picked: list
    by_role: dict
    followed_recommendation: int
    followed_recommendation_wins: int


# ── Routes ───────────────────────────────────────────────────────────────
@router.get("", response_model=List[HistoryEntryOut])
async def get_history(
    limit: int = 50,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return draft history entries, newest first."""
    result = await db.execute(
        select(DraftHistoryDB)
        .where(DraftHistoryDB.user_id == current_user.id)
        .order_by(DraftHistoryDB.timestamp.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=HistoryEntryOut, status_code=201)
async def save_history_entry(
    entry: HistoryEntryIn,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a new draft session to history."""
    db_entry = DraftHistoryDB(
        user_id=current_user.id,
        timestamp=datetime.now(timezone.utc),
        **entry.model_dump(),
    )
    db.add(db_entry)
    await db.commit()
    await db.refresh(db_entry)
    return db_entry


@router.patch("/{entry_id}", response_model=HistoryEntryOut)
async def update_history_result(
    entry_id: UUID,
    body: HistoryResultUpdate,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the result of a history entry (win/loss/remake)."""
    result = await db.execute(
        select(DraftHistoryDB).where(
            DraftHistoryDB.id == entry_id,
            DraftHistoryDB.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée non trouvée.")

    entry.result = body.result
    entry.notes = body.notes
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
async def delete_history_entry(
    entry_id: UUID,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a history entry."""
    result = await db.execute(
        select(DraftHistoryDB).where(
            DraftHistoryDB.id == entry_id,
            DraftHistoryDB.user_id == current_user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée non trouvée.")

    await db.delete(entry)
    await db.commit()
    return {"status": "deleted", "id": str(entry_id)}


@router.get("/stats", response_model=HistoryStatsOut)
async def get_history_stats(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated statistics from draft history."""
    result = await db.execute(
        select(DraftHistoryDB).where(DraftHistoryDB.user_id == current_user.id)
    )
    entries = result.scalars().all()

    total = len(entries)
    wins = sum(1 for e in entries if e.result == "win")
    losses = sum(1 for e in entries if e.result == "loss")
    remakes = sum(1 for e in entries if e.result == "remake")
    unrecorded = total - wins - losses - remakes
    played = wins + losses
    wr = round((wins / played * 100), 1) if played > 0 else 0.0

    # Most picked champions
    champ_stats: dict = {}
    for e in entries:
        cid = e.my_champion_id
        if not cid:
            continue
        if cid not in champ_stats:
            champ_stats[cid] = {
                "champion_id": cid,
                "champion_name": e.my_champion_name or "?",
                "champion_key": e.my_champion_key or "",
                "count": 0,
                "wins": 0,
            }
        champ_stats[cid]["count"] += 1
        if e.result == "win":
            champ_stats[cid]["wins"] += 1

    most_picked = sorted(champ_stats.values(), key=lambda x: -x["count"])[:10]
    for mp in most_picked:
        p = mp["count"]
        w = mp["wins"]
        mp["win_rate"] = round(w / p * 100, 1) if p > 0 else 0.0

    # By role
    by_role: dict = {}
    for e in entries:
        r = e.my_role
        if not r:
            continue
        if r not in by_role:
            by_role[r] = {"games": 0, "wins": 0}
        by_role[r]["games"] += 1
        if e.result == "win":
            by_role[r]["wins"] += 1
    for r, d in by_role.items():
        d["win_rate"] = round(d["wins"] / d["games"] * 100, 1) if d["games"] > 0 else 0.0

    # Recommendation follow rate
    followed = 0
    followed_wins = 0
    scores = []
    probs = []
    for e in entries:
        if e.recommendation_score:
            scores.append(e.recommendation_score)
        if e.win_probability:
            probs.append(e.win_probability)
        if e.recommended_champion and e.my_champion_key == e.recommended_champion:
            followed += 1
            if e.result == "win":
                followed_wins += 1

    return HistoryStatsOut(
        total_games=total,
        wins=wins,
        losses=losses,
        remakes=remakes,
        unrecorded=unrecorded,
        win_rate=wr,
        avg_recommendation_score=round(sum(scores) / len(scores), 1) if scores else 0,
        avg_win_probability=round(sum(probs) / len(probs), 1) if probs else 0,
        most_picked=most_picked,
        by_role=by_role,
        followed_recommendation=followed,
        followed_recommendation_wins=followed_wins,
    )
