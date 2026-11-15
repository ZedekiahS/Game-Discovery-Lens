"""Version preference snapshots without changing existing choices."""
from alembic import op
import sqlalchemy as sa

revision = "0006_preference_version"
down_revision = "0005_player_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("player_preferences", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("player_preferences", "version")
