"""Add private player records and explicit collection purposes without reclassifying existing saves."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_player_library"
down_revision = "0004_create_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("collections", sa.Column("purpose", sa.String(20), nullable=False, server_default="unspecified"))
    op.create_table(
        "player_games",
        sa.Column("user_id", sa.String(120), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("game_id", sa.Integer(), sa.ForeignKey("games.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(20), nullable=True),
        sa.Column("affinity", sa.String(20), nullable=False, server_default="neutral"),
        sa.Column("notes", sa.String(500), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IS NULL OR status IN ('want_to_play', 'playing', 'played')", name="ck_player_game_status"),
        sa.CheckConstraint("affinity IN ('neutral', 'like', 'dislike')", name="ck_player_game_affinity"),
    )
    op.create_table(
        "player_preferences",
        sa.Column("user_id", sa.String(120), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("preferred_tags", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("avoided_tags", postgresql.ARRAY(sa.String()), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("player_preferences")
    op.drop_table("player_games")
    op.drop_column("collections", "purpose")
