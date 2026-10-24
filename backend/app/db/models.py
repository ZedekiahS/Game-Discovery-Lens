from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    price: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    release_year: Mapped[int] = mapped_column(Integer, nullable=False)
    developer: Mapped[str] = mapped_column(String(120), nullable=False)
    publisher: Mapped[str] = mapped_column(String(120), nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    revenue: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ownership: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @property
    def content_source(self):
        from app.services.catalog_provenance import content_source
        return content_source(self)

    @property
    def metrics_kind(self):
        from app.services.catalog_provenance import metrics_kind
        return metrics_kind(self)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="guest", index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_collections_user_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    purpose: Mapped[str] = mapped_column(String(20), nullable=False, default="unspecified", server_default="unspecified")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    saved_games: Mapped[list["SavedGame"]] = relationship(
        back_populates="collection",
        cascade="all, delete-orphan",
    )


class SavedGame(Base):
    __tablename__ = "saved_games"
    __table_args__ = (UniqueConstraint("collection_id", "game_id", name="uq_saved_games_collection_game"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    collection_id: Mapped[int] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    game: Mapped[Game] = relationship()
    collection: Mapped[Collection] = relationship(back_populates="saved_games")


class PlayerGame(Base):
    __tablename__ = "player_games"
    __table_args__ = (
        CheckConstraint("status IS NULL OR status IN ('want_to_play', 'playing', 'played')", name="ck_player_game_status"),
        CheckConstraint("affinity IN ('neutral', 'like', 'dislike')", name="ck_player_game_affinity"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    affinity: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    notes: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class PlayerPreference(Base):
    __tablename__ = "player_preferences"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferred_tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    avoided_tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
