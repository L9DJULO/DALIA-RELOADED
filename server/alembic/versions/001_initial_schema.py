"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-02-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("preferred_roles", JSONB, default=["mid"]),
        sa.Column("weight_overrides", JSONB, nullable=True),
        sa.Column("enable_wildcard", sa.Boolean(), default=True),
        sa.Column("enable_off_meta", sa.Boolean(), default=True),
    )

    # Champion pool table
    op.create_table(
        "champion_pool",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("champion_id", sa.Integer(), nullable=False),
        sa.Column("champion_key", sa.String(50), nullable=False),
        sa.Column("tier", sa.String(1), default="B"),
        sa.UniqueConstraint("user_id", "role", "champion_id", name="uq_user_role_champion"),
    )

    # Draft history table
    op.create_table(
        "draft_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("timestamp", sa.DateTime(timezone=True), index=True),
        sa.Column("patch", sa.String(20), nullable=True),
        sa.Column("my_team", sa.String(10), nullable=True),
        sa.Column("my_role", sa.String(20), nullable=True),
        sa.Column("my_champion_id", sa.Integer(), nullable=True),
        sa.Column("my_champion_key", sa.String(50), nullable=True),
        sa.Column("my_champion_name", sa.String(50), nullable=True),
        sa.Column("ally_picks", JSONB, default=[]),
        sa.Column("enemy_picks", JSONB, default=[]),
        sa.Column("ally_bans", JSONB, default=[]),
        sa.Column("enemy_bans", JSONB, default=[]),
        sa.Column("recommended_champion", sa.String(50), nullable=True),
        sa.Column("recommendation_score", sa.Float(), nullable=True),
        sa.Column("win_probability", sa.Float(), nullable=True),
        sa.Column("result", sa.String(10), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", JSONB, default=[]),
    )


def downgrade() -> None:
    op.drop_table("draft_history")
    op.drop_table("champion_pool")
    op.drop_table("users")
