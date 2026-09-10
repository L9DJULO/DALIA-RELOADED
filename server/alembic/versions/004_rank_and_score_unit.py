"""Rang du joueur, unité de score de l'historique, préférences en multiplicateurs."""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("rank_tier", sa.String(20), nullable=True))
    op.add_column("draft_history", sa.Column("score_unit", sa.String(20), nullable=True))
    # Anciens poids 0..1 → multiplicateurs 0.5..1.5, une seule fois.
    op.execute("""
        UPDATE users SET weight_overrides = (
            SELECT jsonb_object_agg(key, 0.5 + LEAST(GREATEST((value)::float, 0), 1))
            FROM jsonb_each_text(weight_overrides)
        )
        WHERE weight_overrides IS NOT NULL AND jsonb_typeof(weight_overrides) = 'object'
          AND (SELECT count(*) FROM jsonb_each_text(weight_overrides)) > 0
    """)


def downgrade():
    op.execute("""
        UPDATE users SET weight_overrides = (
            SELECT jsonb_object_agg(key, LEAST(GREATEST((value)::float - 0.5, 0), 1))
            FROM jsonb_each_text(weight_overrides)
        )
        WHERE weight_overrides IS NOT NULL AND jsonb_typeof(weight_overrides) = 'object'
          AND (SELECT count(*) FROM jsonb_each_text(weight_overrides)) > 0
    """)
    op.drop_column("draft_history", "score_unit")
    op.drop_column("users", "rank_tier")
