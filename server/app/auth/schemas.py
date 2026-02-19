"""Pydantic schemas for auth requests/responses."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ── Requests ──
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


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
    duo_code: str | None = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str
