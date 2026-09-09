"""DALIA — Auth routes (register, login, me)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password, needs_rehash
from app.auth.schemas import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TokenResponse,
    UpdateMeRequest,
    UserResponse,
)
from app.db.models import UserDB
from app.db.session import get_db

logger = logging.getLogger("dalia.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new user account."""
    # Check username uniqueness
    existing = await db.execute(
        select(UserDB.id).where(
            (UserDB.username == body.username) | (UserDB.email == body.email)
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce nom d'utilisateur ou email est déjà utilisé.",
        )

    user = UserDB(
        username=body.username,
        email=body.email,
        hashed_password=await run_in_threadpool(hash_password, body.password),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Ce nom d'utilisateur ou email est déjà utilisé.")
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    logger.info("New user registered: %s", user.username)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and return a JWT token."""
    result = await db.execute(
        select(UserDB).where(UserDB.username == body.username)
    )
    user = result.scalar_one_or_none()

    if not user or not await run_in_threadpool(verify_password, body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé.",
        )

    if needs_rehash(user.hashed_password):
        user.hashed_password = await run_in_threadpool(hash_password, body.password)
        await db.commit()
    token = create_access_token({"sub": str(user.id)})
    logger.info("User logged in: %s", user.username)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserDB = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UpdateMeRequest,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user settings."""
    if body.preferred_roles is not None:
        current_user.preferred_roles = body.preferred_roles
    if body.enable_wildcard is not None:
        current_user.enable_wildcard = body.enable_wildcard
    if body.enable_off_meta is not None:
        current_user.enable_off_meta = body.enable_off_meta
    if "weight_overrides" in body.model_fields_set:
        current_user.weight_overrides = body.weight_overrides

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)
