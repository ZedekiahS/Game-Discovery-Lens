from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.database import get_db
from app.db.models import Game, PlayerGame, PlayerPreference, User

router = APIRouter(prefix="/me", tags=["player-library"])


class GameRecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["want_to_play", "playing", "played"] | None = None
    affinity: Literal["neutral", "like", "dislike"] = "neutral"
    notes: str = Field(default="", max_length=500)


class GameRecordOut(GameRecordInput):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    game_id: int = Field(alias="gameId")
    updated_at: datetime = Field(alias="updatedAt")


class GameQuickUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["want_to_play", "playing", "played"] | None = None
    affinity: Literal["neutral", "like", "dislike"] = "neutral"

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("Choose a status or preference to update")
        return self


class PreferencesInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid", from_attributes=True)
    preferred_tags: list[str] = Field(default_factory=list, max_length=12, alias="preferredTags")
    avoided_tags: list[str] = Field(default_factory=list, max_length=12, alias="avoidedTags")

    @model_validator(mode="after")
    def disjoint_tags(self):
        self.preferred_tags = list(dict.fromkeys(self.preferred_tags))
        self.avoided_tags = list(dict.fromkeys(self.avoided_tags))
        if set(self.preferred_tags) & set(self.avoided_tags):
            raise ValueError("Preferred and avoided tags must not overlap")
        return self


@router.get("/games", response_model=list[GameRecordOut])
def list_records(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(PlayerGame).where(PlayerGame.user_id == user.id).order_by(PlayerGame.game_id)))


@router.put("/games/{game_id}", response_model=GameRecordOut)
def save_record(game_id: int, request: GameRecordInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(Game, game_id) is None:
        raise HTTPException(404, "Game not found")
    values = request.model_dump()
    values["notes"] = values["notes"].strip()
    # A user/game key is independent of collection membership; concurrent retries cannot duplicate records.
    stmt = insert(PlayerGame).values(user_id=user.id, game_id=game_id, **values)
    db.execute(stmt.on_conflict_do_update(
        index_elements=[PlayerGame.user_id, PlayerGame.game_id], set_={**values, "updated_at": func.now()},
    ))
    db.commit()
    return db.get(PlayerGame, (user.id, game_id))


@router.delete("/games/{game_id}", status_code=204)
def remove_record(game_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(PlayerGame).where(PlayerGame.user_id == user.id, PlayerGame.game_id == game_id))
    db.commit()
    return Response(status_code=204)


@router.patch("/games/{game_id}", response_model=GameRecordOut)
def update_game_preference(game_id: int, request: GameQuickUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(Game, game_id) is None:
        raise HTTPException(404, "Game not found")
    changes = request.model_dump(exclude_unset=True)
    # Update only the chosen fields, including when another tab has changed the note.
    stmt = insert(PlayerGame).values(user_id=user.id, game_id=game_id, **changes)
    db.execute(stmt.on_conflict_do_update(
        index_elements=[PlayerGame.user_id, PlayerGame.game_id], set_={**changes, "updated_at": func.now()},
    ))
    db.commit()
    return db.get(PlayerGame, (user.id, game_id))


@router.get("/preferences", response_model=PreferencesInput)
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.get(PlayerPreference, user.id) or PreferencesInput()


@router.put("/preferences", response_model=PreferencesInput)
def save_preferences(request: PreferencesInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    known = {tag for tags in db.scalars(select(Game.tags)) for tag in tags}
    if not set(request.preferred_tags + request.avoided_tags) <= known:
        raise HTTPException(400, "Choose tags from the game catalog")
    values = request.model_dump()
    stmt = insert(PlayerPreference).values(user_id=user.id, **values)
    db.execute(stmt.on_conflict_do_update(index_elements=[PlayerPreference.user_id], set_=values))
    db.commit()
    return request
