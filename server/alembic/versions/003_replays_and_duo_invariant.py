"""Persist replays and serialize active duo membership.

Existing conflicting links cause a clear migration failure, never silent deletion.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "003"
down_revision = "002"
branch_labels = depends_on = None


def upgrade():
    op.add_column("draft_history", sa.Column("session_id", UUID(as_uuid=True), nullable=True))
    op.add_column("draft_history", sa.Column("timeline", JSONB, nullable=False, server_default="[]"))
    op.create_unique_constraint("uq_history_user_session", "draft_history", ["user_id", "session_id"])
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT member FROM (
        SELECT user_a_id AS member FROM duo_links WHERE status='active'
        UNION ALL SELECT user_b_id FROM duo_links WHERE status='active'
      ) members GROUP BY member HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Conflicting active duo links: resolve memberships before migration 003';
      END IF;
    END $$""")
    # A transaction-level global lock keeps even direct SQL writers serialized.
    # Low-volume duo linking warrants this simpler invariant over cross-row races.
    op.execute("""CREATE FUNCTION enforce_one_active_duo() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(738192003);
      IF NEW.user_a_id = NEW.user_b_id THEN
        RAISE EXCEPTION 'Cannot link a user to themselves' USING ERRCODE='23514';
      END IF;
      IF NEW.status = 'active' AND EXISTS (
        SELECT 1 FROM duo_links d WHERE d.status='active' AND d.id<>NEW.id
        AND (d.user_a_id IN (NEW.user_a_id, NEW.user_b_id) OR d.user_b_id IN (NEW.user_a_id, NEW.user_b_id))
      ) THEN
        RAISE EXCEPTION 'An active duo already exists' USING ERRCODE='23505';
      END IF;
      RETURN NEW;
    END $$""")
    op.execute("CREATE TRIGGER one_active_duo BEFORE INSERT OR UPDATE ON duo_links FOR EACH ROW EXECUTE FUNCTION enforce_one_active_duo()")


def downgrade():
    op.execute("DROP TRIGGER one_active_duo ON duo_links")
    op.execute("DROP FUNCTION enforce_one_active_duo()")
    op.drop_constraint("uq_history_user_session", "draft_history", type_="unique")
    op.drop_column("draft_history", "timeline")
    op.drop_column("draft_history", "session_id")
