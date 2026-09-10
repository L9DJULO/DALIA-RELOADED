"""Pydantic schemas for auth requests/responses."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator
from app.models.validation import RankBucket, Role, validate_weights


# ── Requests ──
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=1, max_length=128)


# ── Responses ──
class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    is_active: bool
    is_admin: bool = False
    created_at: datetime
    preferred_roles: list
    enable_wildcard: bool
    enable_off_meta: bool
    rank_tier: str | None = None
    duo_code: str | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UpdateMeRequest(BaseModel):
    preferred_roles: list[Role] | None = Field(default=None, max_length=5)
    enable_wildcard: bool | None = None
    enable_off_meta: bool | None = None
    weight_overrides: dict[str, float] | None = None
    rank_tier: RankBucket = None
    _weights_valid = field_validator("weight_overrides")(validate_weights)


class MessageResponse(BaseModel):
    message: str
