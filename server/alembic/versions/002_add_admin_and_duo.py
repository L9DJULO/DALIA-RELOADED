"""add is_admin and duo_code columns, duo_links table

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
    # Add is_admin to users
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), server_default="false", nullable=False))

    # duo_code + duo_links were already created by SQLAlchemy create_all
    # so we only need to add is_admin here.


def downgrade() -> None:
    op.drop_column("users", "is_admin")
