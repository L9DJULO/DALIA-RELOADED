"""DALIA — Main API routes (champions, draft, meta, ML).

These routes handle the core draft logic. Most are public (data endpoints),
while draft/recommend uses the auth'd user's pool when available.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import config
from app.models.draft import DraftRequest, DraftResponse, PoolEntry
from app.auth.deps import get_current_user, oauth2_scheme, require_admin
from app.db.models import ChampionPoolEntryDB, DuoLinkDB, UserDB
from app.db.session import get_db

logger = logging.getLogger("dalia.api")
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────
def _require_ready(request: Request):
    """Raise 503 if background services haven't finished initializing."""
    if not getattr(request.app.state, "ready", False):
        raise HTTPException(
            status_code=503,
            detail="Le serveur démarre, réessaie dans quelques secondes…",
        )


def _get_engine(request: Request):
    _require_ready(request)
    return request.app.state.draft_engine


def _get_db_service(request: Request):
    _require_ready(request)
    return request.app.state.champion_db


def _get_fetcher(request: Request):
    _require_ready(request)
    return request.app.state.fetcher


def _get_ban_recommender(request: Request):
    _require_ready(request)
    return request.app.state.ban_recommender


async def _get_user_pool(user: UserDB, db: AsyncSession) -> Dict[str, List[PoolEntry]]:
    """Load a user's champion pool from DB, formatted for the draft engine."""
    result = await db.execute(
        select(ChampionPoolEntryDB).where(ChampionPoolEntryDB.user_id == user.id)
    )
    entries = result.scalars().all()

    pool: Dict[str, List[PoolEntry]] = {
        "top": [], "jungle": [], "mid": [], "bot": [], "support": []
    }
    for e in entries:
        pool[e.role].append(
            PoolEntry(champion_id=e.champion_id, champion_key=e.champion_key, tier=e.tier)
        )
    return pool


async def _load_duo_partner_pool(user: UserDB, db: AsyncSession) -> Optional[Dict[str, List[PoolEntry]]]:
    """Load the duo partner's champion pool from DB (if a duo link is active)."""
    link = await db.execute(
        select(DuoLinkDB).where(
            and_(
                DuoLinkDB.status == "active",
                or_(
                    DuoLinkDB.user_a_id == user.id,
                    DuoLinkDB.user_b_id == user.id,
                ),
            )
        )
    )
    duo_link = link.scalar_one_or_none()
    if not duo_link:
        return None

    partner_id = duo_link.user_b_id if duo_link.user_a_id == user.id else duo_link.user_a_id

    result = await db.execute(
        select(ChampionPoolEntryDB).where(ChampionPoolEntryDB.user_id == partner_id)
    )
    entries = result.scalars().all()

    pool: Dict[str, List[PoolEntry]] = {
        "top": [], "jungle": [], "mid": [], "bot": [], "support": []
    }
    for e in entries:
        pool[e.role].append(
            PoolEntry(champion_id=e.champion_id, champion_key=e.champion_key, tier=e.tier)
        )
    return pool


# ═════════════════════════════════════════════════════════════════════════
#  CHAMPIONS (public)
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
    db = _get_db_service(request)
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
    db = _get_db_service(request)
    c = db.get_by_id(champion_id)
    if not c:
        return {"error": "Champion not found"}
    return c.model_dump()


# ═════════════════════════════════════════════════════════════════════════
#  META / TIER LIST (public)
# ═════════════════════════════════════════════════════════════════════════
@router.get("/meta/tierlist")
async def tierlist(request: Request, role: str = "mid"):
    """Return meta tier list for a role with scores."""
    engine = _get_engine(request)
    scores = await engine.meta.scores_for_role(role)
    db = _get_db_service(request)
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
#  DRAFT RECOMMENDATIONS (auth required — uses user's pool)
# ═════════════════════════════════════════════════════════════════════════
@router.post("/draft/recommend", response_model=DraftResponse)
async def draft_recommend(
    body: DraftRequest,
    request: Request,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get champion recommendations using the authenticated user's pool."""
    engine = _get_engine(request)

    # If the request doesn't include a pool, load from DB
    if not body.champion_pool or all(
        len(v) == 0 for v in body.champion_pool.values()
    ):
        body.champion_pool = await _get_user_pool(current_user, db)

    # ── DuoQ: load partner's pool if duo is active ──
    if body.duo_active and body.duo_partner_role and not body.duo_partner_pool:
        partner_pool = await _load_duo_partner_pool(current_user, db)
        if partner_pool:
            body.duo_partner_pool = partner_pool

    return await engine.recommend(body)


# ═════════════════════════════════════════════════════════════════════════
#  BAN RECOMMENDATIONS (auth required)
# ═════════════════════════════════════════════════════════════════════════
class BanRequest(BaseModel):
    my_role: str = "mid"
    champion_pool: Dict[str, List[PoolEntry]] = {}
    already_banned: List[int] = []
    already_picked: List[int] = []


@router.post("/draft/bans")
async def recommend_bans(
    body: BanRequest,
    request: Request,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get ban recommendations based on pool and meta."""
    recommender = _get_ban_recommender(request)

    # Load pool from DB if not provided
    if not body.champion_pool or all(
        len(v) == 0 for v in body.champion_pool.values()
    ):
        body.champion_pool = await _get_user_pool(current_user, db)

    bans = await recommender.recommend_bans(
        my_role=body.my_role,
        champion_pool=body.champion_pool,
        already_banned=body.already_banned,
        already_picked=body.already_picked,
    )
    return {"ban_suggestions": bans}


# ═════════════════════════════════════════════════════════════════════════
#  PATCH INFO (public)
# ═════════════════════════════════════════════════════════════════════════
@router.get("/patch")
async def current_patch(request: Request):
    fetcher = _get_fetcher(request)
    ver = await fetcher.get_ddragon_version()
    patch = await fetcher.get_current_patch()
    return {"version": ver, "patch": patch}


# ═════════════════════════════════════════════════════════════════════════
#  ML — STATUS / RETRAIN / EMBEDDINGS (public reads, auth for writes)
# ═════════════════════════════════════════════════════════════════════════
def _get_patch_watcher(request: Request):
    return request.app.state.patch_watcher


@router.get("/ml/status")
async def ml_status(request: Request):
    """Return ML training status & patch watcher info."""
    pw = _get_patch_watcher(request)
    return pw.get_status_dict()


@router.post("/ml/retrain")
async def ml_retrain(request: Request, _admin: UserDB = Depends(require_admin)):
    """Manually trigger model re-training. Admin only."""
    pw = _get_patch_watcher(request)
    started = pw.trigger_retrain()
    if started:
        return {"status": "started", "message": "Entraînement lancé en arrière-plan."}
    return {"status": "already_running", "message": "Un entraînement est déjà en cours."}


@router.post("/ml/reload")
async def ml_reload(request: Request, _admin: UserDB = Depends(require_admin)):
    """Reload the ML model from disk. Admin only."""
    pw = _get_patch_watcher(request)
    engine = _get_engine(request)
    pw.reload_model(engine.ml)
    return {"status": "reloaded"}


@router.get("/ml/embeddings")
async def ml_embeddings(request: Request, role: str = "mid"):
    """Return 2D embedding map for champion cluster visualisation."""
    engine = _get_engine(request)
    if engine.ml is None:
        return {"embeddings": [], "available": False}
    data = engine.ml.get_embedding_map(role)
    return {"embeddings": data, "available": True, "role": role}


@router.get("/ml/similar/{champion_id}")
async def ml_similar(champion_id: int, request: Request, role: str = "mid", n: int = 8):
    """Return champions most similar in embedding space."""
    engine = _get_engine(request)
    if engine.ml is None:
        return {"similar": [], "available": False}
    db = _get_db_service(request)
    champ = db.get_by_id(champion_id)
    similar = engine.ml.get_similar_champions(champion_id, role, n=n)
    return {
        "champion_id": champion_id,
        "champion_name": champ.name if champ else "?",
        "role": role,
        "similar": similar,
        "available": True,
    }
