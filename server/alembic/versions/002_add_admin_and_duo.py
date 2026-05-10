"""add is_admin, duo_code columns and duo_links table

Revision ID: 002
Revises: 001
Create Date: 2026-02-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_cols = {c["name"] for c in inspector.get_columns("users")}
    user_indexes = {i["name"] for i in inspector.get_indexes("users")}

    if "is_admin" not in user_cols:
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False),
        )

    if "duo_code" not in user_cols:
        op.add_column("users", sa.Column("duo_code", sa.String(10), nullable=True))

    if "ix_users_duo_code" not in user_indexes:
        op.create_index("ix_users_duo_code", "users", ["duo_code"], unique=True)

    if "duo_links" not in inspector.get_table_names():
        op.create_table(
            "duo_links",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_a_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_b_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(20), server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint(
                "user_a_id", "user_b_id", "status", name="uq_duo_link_active"
            ),
        )


def downgrade() -> None:
    op.drop_table("duo_links")
    op.drop_index("ix_users_duo_code", table_name="users")
    op.drop_column("users", "duo_code")
    op.drop_column("users", "is_admin")
