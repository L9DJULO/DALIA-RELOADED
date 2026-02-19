"""DALIA — Auth routes (register, login, me)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.auth.password import hash_password, verify_password
from app.auth.schemas import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TokenResponse,
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
        select(UserDB).where(
            (UserDB.username == body.username) | (UserDB.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce nom d'utilisateur ou email est déjà utilisé.",
        )

    user = UserDB(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    logger.info(f"New user registered: {user.username}")
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

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé.",
        )

    token = create_access_token({"sub": str(user.id)})
    logger.info(f"User logged in: {user.username}")
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
    preferred_roles: list[str] | None = None,
    enable_wildcard: bool | None = None,
    enable_off_meta: bool | None = None,
    weight_overrides: dict | None = None,
    current_user: UserDB = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user settings."""
    if preferred_roles is not None:
        current_user.preferred_roles = preferred_roles
    if enable_wildcard is not None:
        current_user.enable_wildcard = enable_wildcard
    if enable_off_meta is not None:
        current_user.enable_off_meta = enable_off_meta
    if weight_overrides is not None:
        current_user.weight_overrides = weight_overrides

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)
