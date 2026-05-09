"""DALIA — DuoQ routes (link, unlink, partner info, partner pool)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.models import ChampionPoolEntryDB, DuoLinkDB, UserDB, _generate_duo_code
from app.db.session import get_db
from app.models.draft import PoolEntry

logger = logging.getLogger("dalia.duo")
router = APIRouter(prefix="/duo", tags=["duo"])


# ── Schemas ──────────────────────────────────────────────
class DuoCodeResponse(BaseModel):
    duo_code: str


class DuoLinkRequest(BaseModel):
    code: str


class DuoPartnerResponse(BaseModel):
    id: str
    username: str
    preferred_roles: list
    linked_since: datetime


class DuoPartnerPoolResponse(BaseModel):
    username: str
    champion_pool: dict  # role → [{champion_id, champion_key, tier}]


class DuoStatusResponse(BaseModel):
    linked: bool
    partner: Optional[DuoPartnerResponse] = None


# ── Helpers ──────────────────────────────────────────────
async def _get_active_link(user_id, db: AsyncSession) -> Optional[DuoLinkDB]:
    """Find the active duo link for a user (as either initiator or target)."""
    result = await db.execute(
        select(DuoLinkDB)
        .where(
            and_(
                DuoLinkDB.status == "active",
                or_(
                    DuoLinkDB.user_a_id == user_id,
                    DuoLinkDB.user_b_id == user_id,
                ),
            )
        )
        .options(selectinload(DuoLinkDB.user_a), selectinload(DuoLinkDB.user_b))
    )
    return result.scalar_one_or_none()


async def _get_partner_from_link(link: DuoLinkDB, my_id) -> UserDB:
    """Given a duo link, return the other user."""
    if link.user_a_id == my_id:
        return link.user_b
    return link.user_a


async def _assign_unique_duo_code(user: UserDB, db: AsyncSession, tries: int = 6) -> str:
    """Assign a fresh duo code to ``user`` with collision-retry.

    The ``duo_code`` column is UNIQUE; ``_generate_duo_code`` picks from
    a ~30-char alphabet × 6 positions ≈ 7.3e8 combos so collisions are
    rare, but not impossible. We retry on IntegrityError up to ``tries``
    times before giving up with a 500.
    """
    for _ in range(tries):
        candidate = _generate_duo_code()
        user.duo_code = candidate
        try:
            await db.commit()
            await db.refresh(user)
            return candidate
        except IntegrityError:
            await db.rollback()
            # Re-attach user to the session before next attempt.
            user = await db.merge(user)
    logger.error("Exhausted duo-code collision retries for user %s", user.id)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Impossible de générer un code unique pour le moment.",
    )


# ═════════════════════════════════════════════════════════
#  GET /duo/code — Get or generate my duo code
# ═════════════════════════════════════════════════════════
@router.get("/code", response_model=DuoCodeResponse)
async def get_duo_code(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user's duo code, generating one if it doesn't exist."""
    if not current_user.duo_code:
        await _assign_unique_duo_code(current_user, db)

    return DuoCodeResponse(duo_code=current_user.duo_code)


# ═════════════════════════════════════════════════════════
#  POST /duo/code/regenerate — Get a new duo code
# ═════════════════════════════════════════════════════════
@router.post("/code/regenerate", response_model=DuoCodeResponse)
async def regenerate_duo_code(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a fresh duo code (invalidates previous one)."""
    await _assign_unique_duo_code(current_user, db)
    return DuoCodeResponse(duo_code=current_user.duo_code)


# ═════════════════════════════════════════════════════════
#  GET /duo/status — Current duo status
# ═════════════════════════════════════════════════════════
@router.get("/status", response_model=DuoStatusResponse)
async def get_duo_status(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if the user has an active duo partner."""
    link = await _get_active_link(current_user.id, db)
    if not link:
        return DuoStatusResponse(linked=False)

    partner = await _get_partner_from_link(link, current_user.id)
    return DuoStatusResponse(
        linked=True,
        partner=DuoPartnerResponse(
            id=str(partner.id),
            username=partner.username,
            preferred_roles=partner.preferred_roles or ["mid"],
            linked_since=link.created_at,
        ),
    )


# ═════════════════════════════════════════════════════════
#  POST /duo/link — Link with a friend using their code
# ═════════════════════════════════════════════════════════
@router.post("/link", response_model=DuoStatusResponse)
async def link_duo(
    body: DuoLinkRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link with another user using their duo code."""
    code = body.code.strip().upper()

    # Can't link with yourself
    if current_user.duo_code and current_user.duo_code.upper() == code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu ne peux pas te lier avec toi-même !",
        )

    # Check if already linked
    existing = await _get_active_link(current_user.id, db)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tu as déjà un partenaire duo. Délie-toi d'abord.",
        )

    # Find the target user by code
    result = await db.execute(
        select(UserDB).where(UserDB.duo_code == code)
    )
    target = result.scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code duo introuvable. Vérifie le code avec ton ami.",
        )

    # Check if target already has an active link
    target_link = await _get_active_link(target.id, db)
    if target_link:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{target.username} a déjà un partenaire duo.",
        )

    # Create the link
    link = DuoLinkDB(
        user_a_id=current_user.id,
        user_b_id=target.id,
        status="active",
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    logger.info(f"DuoQ link created: {current_user.username} ↔ {target.username}")

    return DuoStatusResponse(
        linked=True,
        partner=DuoPartnerResponse(
            id=str(target.id),
            username=target.username,
            preferred_roles=target.preferred_roles or ["mid"],
            linked_since=link.created_at,
        ),
    )


# ═════════════════════════════════════════════════════════
#  DELETE /duo/unlink — Unlink from current partner
# ═════════════════════════════════════════════════════════
@router.delete("/unlink")
async def unlink_duo(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End the active duo partnership.

    Physical DELETE (not UPDATE → status='ended') on purpose: the
    existing ``uq_duo_link_active`` unique constraint includes ``status``
    in its tuple, which rejects a second ``(a, b, 'ended')`` row when
    the same pair re-links and unlinks a second time. ``ended`` rows are
    never read anywhere in the codebase, so DELETE is functionally
    equivalent and sidesteps the constraint without a schema migration.
    """
    link = await _get_active_link(current_user.id, db)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun partenaire duo actif.",
        )

    partner = await _get_partner_from_link(link, current_user.id)
    partner_username = partner.username  # capture before DELETE detaches the row

    await db.delete(link)
    await db.commit()

    logger.info(f"DuoQ link ended: {current_user.username} ↔ {partner_username}")

    return {"message": f"Duo avec {partner_username} terminé."}


# ═════════════════════════════════════════════════════════
#  GET /duo/partner/pool — Get partner's champion pool
# ═════════════════════════════════════════════════════════
@router.get("/partner/pool", response_model=DuoPartnerPoolResponse)
async def get_partner_pool(
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the duo partner's champion pool (for synergy calculations)."""
    link = await _get_active_link(current_user.id, db)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun partenaire duo actif.",
        )

    partner = await _get_partner_from_link(link, current_user.id)

    # Load partner's pool
    result = await db.execute(
        select(ChampionPoolEntryDB).where(ChampionPoolEntryDB.user_id == partner.id)
    )
    entries = result.scalars().all()

    pool: dict = {"top": [], "jungle": [], "mid": [], "bot": [], "support": []}
    for e in entries:
        bucket = pool.get(e.role)
        if bucket is None:
            # Skip unknown/legacy role values rather than KeyError'ing.
            logger.warning("Skipping partner pool entry with unknown role: %r", e.role)
            continue
        bucket.append({
            "champion_id": e.champion_id,
            "champion_key": e.champion_key,
            "tier": e.tier,
        })

    return DuoPartnerPoolResponse(
        username=partner.username,
        champion_pool=pool,
    )
