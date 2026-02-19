"""SQLAlchemy ORM models — Users, Champion Pool, Draft History, DuoQ Links."""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


def _generate_duo_code(length: int = 6) -> str:
    """Generate a random alphanumeric duo code (uppercase, no ambiguous chars)."""
    alphabet = string.ascii_uppercase + string.digits
    # Remove ambiguous: 0/O, 1/I/L
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("1", "").replace("L", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


class Base(DeclarativeBase):
    """Declarative base for all DB models."""
    pass


class UserDB(Base):
    """Registered user account."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Settings (stored as JSON) ──
    preferred_roles = Column(JSONB, default=lambda: ["mid"])
    weight_overrides = Column(JSONB, nullable=True)
    enable_wildcard = Column(Boolean, default=True)
    enable_off_meta = Column(Boolean, default=True)

    # ── DuoQ ──
    duo_code = Column(String(10), unique=True, nullable=True, index=True, default=_generate_duo_code)

    # ── Relationships ──
    champion_pool = relationship(
        "ChampionPoolEntryDB",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    draft_history = relationship(
        "DraftHistoryDB",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # DuoQ links where this user is "user_a" (initiator)
    duo_links_initiated = relationship(
        "DuoLinkDB",
        foreign_keys="DuoLinkDB.user_a_id",
        back_populates="user_a",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # DuoQ links where this user is "user_b" (target)
    duo_links_received = relationship(
        "DuoLinkDB",
        foreign_keys="DuoLinkDB.user_b_id",
        back_populates="user_b",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ChampionPoolEntryDB(Base):
    """A single champion in a user's pool for a specific role."""
    __tablename__ = "champion_pool"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # top, jungle, mid, bot, support
    champion_id = Column(Integer, nullable=False)
    champion_key = Column(String(50), nullable=False)
    tier = Column(String(1), default="B")  # S, A, B, C, D

    user = relationship("UserDB", back_populates="champion_pool")

    __table_args__ = (
        UniqueConstraint("user_id", "role", "champion_id", name="uq_user_role_champion"),
    )


class DraftHistoryDB(Base):
    """A recorded draft session."""
    __tablename__ = "draft_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    patch = Column(String(20), nullable=True)

    # ── Draft context ──
    my_team = Column(String(10), nullable=True)  # "blue" | "red"
    my_role = Column(String(20), nullable=True)
    my_champion_id = Column(Integer, nullable=True)
    my_champion_key = Column(String(50), nullable=True)
    my_champion_name = Column(String(50), nullable=True)

    # ── Full draft snapshot (JSONB) ──
    ally_picks = Column(JSONB, default=list)   # [{champion_id, key, name, role}, ...]
    enemy_picks = Column(JSONB, default=list)
    ally_bans = Column(JSONB, default=list)    # [champion_id, ...]
    enemy_bans = Column(JSONB, default=list)

    # ── Recommendation tracking ──
    recommended_champion = Column(String(50), nullable=True)
    recommendation_score = Column(Float, nullable=True)
    win_probability = Column(Float, nullable=True)

    # ── Result ──
    result = Column(String(10), nullable=True)  # "win" | "loss" | "remake" | null
    notes = Column(Text, nullable=True)

    # ── Extra data ──
    tags = Column(JSONB, default=list)

    user = relationship("UserDB", back_populates="draft_history")


class DuoLinkDB(Base):
    """A DuoQ link between two users."""
    __tablename__ = "duo_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_a_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_b_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(String(20), default="active")  # "active" | "ended"
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user_a = relationship("UserDB", foreign_keys=[user_a_id], back_populates="duo_links_initiated")
    user_b = relationship("UserDB", foreign_keys=[user_b_id], back_populates="duo_links_received")

    __table_args__ = (
        # Only one active link per pair
        UniqueConstraint("user_a_id", "user_b_id", "status", name="uq_duo_link_active"),
    )