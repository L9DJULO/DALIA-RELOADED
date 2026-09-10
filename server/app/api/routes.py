"""DALIA — Main API routes (champions, draft, meta, ML).

These routes handle the core draft logic. Most are public (data endpoints),
while draft/recommend uses the auth'd user's pool when available.
"""
from __future__ import annotations

import logging
import math
from typing import Dict, List, Optional, Literal
# UserDB used as Optional type hint in route signatures

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from app.models.validation import Role, Puuid, Region, ChampionId, RANK_BUCKETS, normalize_rank_bucket
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import config
from app.models.draft import DraftRequest, DraftResponse, PoolEntry, AnnotatedPool, CompareRequest, PoolAdviceRequest
from app.services.pool_advisor import advise_pool
from app.auth.deps import get_current_user, get_optional_user, oauth2_scheme, require_admin
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
    """Return a single champion by ID."""
    db = _get_db_service(request)
    c = db.get_by_id(champion_id)
    if not c:
        raise HTTPException(status_code=404, detail="Champion introuvable.")
    return c.model_dump()


# ═════════════════════════════════════════════════════════════════════════
#  META / TIER LIST (public)
# ═════════════════════════════════════════════════════════════════════════
@router.get("/meta/tierlist")
async def tierlist(request: Request, role: Role = "mid"):
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
    current_user: Optional[UserDB] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get champion recommendations. Works unauthenticated (pool from body)
    or authenticated (pool loaded from DB when body pool is empty)."""
    engine = _get_engine(request)
    validate_champion_ids(engine.db, body)
    await _apply_account_context(body, current_user, db)

    personal_svc = getattr(request.app.state, "personal_stats", None)
    try:
        return await engine.recommend(body, personal_svc=personal_svc)
    except TimeoutError:
        raise HTTPException(503, "Les sources de données répondent trop lentement. Réessaie dans quelques instants.")


def _pool_is_empty(pool) -> bool:
    return not pool or all(len(v) == 0 for v in pool.values())


async def _apply_account_context(body: DraftRequest, current_user: Optional[UserDB], db: AsyncSession) -> None:
    """Fill the pool and DuoQ partner from the account, identically for every draft route.

    Anonymous users must send their pool in the body. DuoQ needs an active link and
    a partner role; when either is missing the boost is disabled rather than half-applied.
    """
    if current_user is not None and body.rank_bucket is None and getattr(current_user, "rank_tier", None):
        normalized = normalize_rank_bucket(current_user.rank_tier)
        body.rank_bucket = normalized if normalized in RANK_BUCKETS else None
    if current_user and _pool_is_empty(body.champion_pool):
        body.champion_pool = await _get_user_pool(current_user, db)

    if not body.duo_active:
        body.duo_partner_role = None
        body.duo_partner_pool = None
        return
    if current_user and body.duo_partner_role and not body.duo_partner_pool:
        try:
            body.duo_partner_pool = await _load_duo_partner_pool(current_user, db)
        except Exception as exc:
            logger.warning("Failed to load duo partner pool: %s", exc)
            body.duo_partner_pool = None
    if not current_user or not body.duo_partner_role or not body.duo_partner_pool:
        logger.info("DuoQ requested without an active link, partner role or pool — disabling boost")
        body.duo_active = False
        body.duo_partner_role = None
        body.duo_partner_pool = None


def validate_champion_ids(catalog, body):
    """Reject unknown champions on the board; silently drop them from pools.

    Board ids are chosen in the current session and must exist. Pool entries may
    predate the current catalog (removed or renamed champion): the editor cannot
    always show them, so they must not block every analysis of the account.
    """
    ids = set(body.draft_state.bans)
    ids.update(p.champion_id for p in body.draft_state.ally_picks + body.draft_state.enemy_picks + body.draft_state.ally_prepicks if p.champion_id)
    ids.update(getattr(body, "champion_ids", []))
    if any(catalog.get_by_id(cid) is None for cid in ids):
        raise HTTPException(422, "Champion inconnu du catalogue actuel")
    for attribute in ("champion_pool", "duo_partner_pool"):
        pool = getattr(body, attribute, None)
        if not pool:
            continue
        for role, entries in pool.items():
            kept = [e for e in entries if catalog.get_by_id(e.champion_id) is not None]
            if len(kept) != len(entries):
                logger.warning("Dropping %d unknown pool entries for role %s", len(entries) - len(kept), role)
                pool[role] = kept


@router.post("/draft/compare")
async def compare_champions(body: CompareRequest, request: Request,
                            current_user: Optional[UserDB] = Depends(get_optional_user),
                            db: AsyncSession = Depends(get_db)):
    engine = _get_engine(request)
    validate_champion_ids(engine.db, body)
    if set(body.champion_ids) & body.draft_state.all_unavailable_ids:
        raise HTTPException(422, "Un des deux champions est déjà choisi ou banni")
    await _apply_account_context(body, current_user, db)
    try:
        result = await engine.recommend(body, personal_svc=getattr(request.app.state, "personal_stats", None),
                                        candidate_ids=body.champion_ids)
    except TimeoutError:
        raise HTTPException(503, "Comparaison temporairement indisponible")
    indexed = {r.champion_id: r for r in result.recommendations}
    if any(cid not in indexed for cid in body.champion_ids):
        raise HTTPException(422, "Un des deux champions ne peut pas être évalué dans cette draft")
    left, right = (indexed[cid] for cid in body.champion_ids)
    names = {t.name for t in left.breakdown.terms} | {t.name for t in right.breakdown.terms}

    def term_value(rec, name):
        return next((t.value for t in rec.breakdown.terms if t.name == name), 0.0)

    order = ["meta", "matchup", "future_opponent", "mastery", "composition", "archetype", "synergy", "mechanics", "model"]
    deltas = [{"dimension": name, "left": round(term_value(left, name), 2), "right": round(term_value(right, name), 2),
               "delta": round(term_value(left, name) - term_value(right, name), 2)} for name in order if name in names]
    combined_sd = round(math.sqrt(left.score_sd ** 2 + right.score_sd ** 2), 2)
    score_delta = round(left.total_score - right.total_score, 2)
    delta_pp = None
    if left.wpa and right.wpa:
        delta_pp = round((left.breakdown.ml_explanation.win_probability - right.breakdown.ml_explanation.win_probability) * 100, 2)
    return {"left": left, "right": right, "score_delta": score_delta, "combined_sd": combined_sd,
            "tied": abs(score_delta) < combined_sd, "dimensions": deltas, "wpa_delta_pp": delta_pp,
            "data_status": result.data_status,
            "explanation": "Même draft, mêmes préférences. Chaque ligne est une contribution en points de win rate ; l'écart final est comparé à l'incertitude combinée."}


@router.post("/pool/advice")
async def pool_advice(body: PoolAdviceRequest, request: Request):
    catalog = _get_db_service(request)
    entries = body.champion_pool.get(body.role, [])
    if any(catalog.get_by_id(e.champion_id) is None for e in entries):
        raise HTTPException(422, "Champion inconnu du catalogue actuel")
    return advise_pool(catalog, body.role, entries)


# ═════════════════════════════════════════════════════════════════════════
#  BAN RECOMMENDATIONS (auth required)
# ═════════════════════════════════════════════════════════════════════════
class BanRequest(BaseModel):
    my_role: Role = "mid"
    champion_pool: Dict[Role, AnnotatedPool] = {}
    already_banned: List[ChampionId] = Field(default_factory=list, max_length=10)
    already_picked: List[ChampionId] = Field(default_factory=list, max_length=10)


@router.post("/draft/bans")
async def recommend_bans(
    body: BanRequest,
    request: Request,
    current_user: Optional[UserDB] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Get ban recommendations based on pool and meta."""
    recommender = _get_ban_recommender(request)
    catalog = _get_db_service(request)
    if any(catalog.get_by_id(cid) is None for cid in body.already_banned + body.already_picked):
        raise HTTPException(422, "Champion inconnu du catalogue actuel")

    # Load pool from DB if not provided (requires auth)
    if current_user is not None and body.rank_bucket is None and getattr(current_user, "rank_tier", None):
        normalized = normalize_rank_bucket(current_user.rank_tier)
        body.rank_bucket = normalized if normalized in RANK_BUCKETS else None
    if current_user and _pool_is_empty(body.champion_pool):
        body.champion_pool = await _get_user_pool(current_user, db)
    for role, entries in body.champion_pool.items():
        body.champion_pool[role] = [e for e in entries if catalog.get_by_id(e.champion_id) is not None]

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
    _require_ready(request)
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
    return {"status": pw.status, "message": pw.get_status_dict().get("last_error") or "Un entraînement est déjà en cours."}


@router.post("/ml/reload")
async def ml_reload(request: Request, _admin: UserDB = Depends(require_admin)):
    """Reload the ML model from disk. Admin only."""
    pw = _get_patch_watcher(request)
    engine = _get_engine(request)
    if not await pw.reload_model():
        raise HTTPException(409, "Aucun modèle validé pour le patch courant à charger.")
    return {"status": "reloaded"}


@router.get("/ml/embeddings")
async def ml_embeddings(request: Request, role: Role = "mid"):
    """Return 2D embedding map for champion cluster visualisation."""
    engine = _get_engine(request)
    ml = engine.ml
    if ml is None:
        return {"embeddings": [], "available": False}
    data = ml.get_embedding_map(role)
    return {"embeddings": data, "available": True, "role": role}


@router.get("/ml/similar/{champion_id}")
async def ml_similar(champion_id: int, request: Request, role: Role = "mid", n: int = Query(default=8, ge=1, le=30)):
    """Return champions most similar in embedding space."""
    engine = _get_engine(request)
    ml = engine.ml
    if ml is None:
        return {"similar": [], "available": False}
    db = _get_db_service(request)
    champ = db.get_by_id(champion_id)
    if not champ:
        raise HTTPException(status_code=404, detail="Champion introuvable.")
    similar = ml.get_similar_champions(champion_id, role, n=n)
    return {
        "champion_id": champion_id,
        "champion_name": champ.name if champ else "?",
        "role": role,
        "similar": similar,
        "available": True,
    }


# ═════════════════════════════════════════════════════════════════════════
#  PERSONAL STATS (auth required — uses Riot API via LCU identity)
# ═════════════════════════════════════════════════════════════════════════
class PersonalStatsRequest(BaseModel):
    puuid: Puuid
    region: Region = "EUW1"
    queue: Literal["ranked", "flex"] = "ranked"
    count: int = Field(default=50, ge=1, le=100)


@router.post("/personal/stats")
async def personal_stats(
    body: PersonalStatsRequest,
    request: Request,
    current_user: UserDB = Depends(get_current_user),
):
    """Fetch personal ranked stats for a player via Riot API."""
    _require_ready(request)
    personal_svc = request.app.state.personal_stats
    data = await personal_svc.get_personal_stats(
        puuid=body.puuid,
        region=body.region,
        queue=body.queue,
        count=body.count,
    )
    return data
