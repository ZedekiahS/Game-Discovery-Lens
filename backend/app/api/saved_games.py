from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.db.database import get_db
from app.db.models import Collection, Game, SavedGame, User
from app.schemas import (
    CollectionCreateRequest,
    CollectionOut,
    CollectionUpdateRequest,
    SavedGameOut,
    SavedGameRequest,
    ShortlistInsightsOut,
)
from app.services.shortlist_insights import build_shortlist_insights

router = APIRouter(tags=["saved-games"])

DEFAULT_COLLECTION_NAME = "Default Shortlist"


@router.get("/collections", response_model=list[CollectionOut])
def list_collections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Collection]:
    user_id = current_user.id
    get_or_create_default_collection(db, user_id)
    stmt = select(Collection).where(Collection.user_id == user_id).order_by(Collection.created_at.asc(), Collection.id.asc())
    return list(db.scalars(stmt).all())


@router.post("/collections", response_model=CollectionOut, status_code=201)
def create_collection(
    request: CollectionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Collection:
    user_id = current_user.id
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    existing = db.scalar(select(Collection).where(Collection.user_id == user_id, Collection.name == name))
    if existing is not None:
        return existing

    collection = Collection(user_id=user_id, name=name, description=request.description.strip(), purpose=request.purpose)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection


@router.patch("/collections/{collection_id}", response_model=CollectionOut)
def update_collection(
    collection_id: int,
    request: CollectionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Collection:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    if collection.name == DEFAULT_COLLECTION_NAME and request.name.strip() != collection.name:
        raise HTTPException(status_code=400, detail="Default collection cannot be renamed")

    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    existing = db.scalar(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.name == name,
            Collection.id != collection.id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Collection name already exists")

    collection.name = name
    if request.description is not None:
        collection.description = request.description.strip()
    if request.purpose is not None:
        collection.purpose = request.purpose
    db.commit()
    db.refresh(collection)
    return collection


@router.delete("/collections/{collection_id}", status_code=204, response_class=Response)
def delete_collection(
    collection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    if collection.name == DEFAULT_COLLECTION_NAME:
        raise HTTPException(status_code=400, detail="Default collection cannot be deleted")

    db.delete(collection)
    db.commit()
    return Response(status_code=204)


@router.get("/saved-games", response_model=list[SavedGameOut])
def list_saved_games(
    collection_id: int | None = Query(default=None, alias="collectionId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SavedGame]:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    return get_saved_games_for_collection(db, collection.id)


@router.get("/saved-games/insights", response_model=ShortlistInsightsOut)
def get_saved_games_insights(
    collection_id: int | None = Query(default=None, alias="collectionId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    saved_games = get_saved_games_for_collection(db, collection.id)
    return build_shortlist_insights(saved_games, user_id)


def get_saved_games_for_collection(db: Session, collection_id: int) -> list[SavedGame]:
    stmt = (
        select(SavedGame)
        .options(joinedload(SavedGame.game))
        .where(SavedGame.collection_id == collection_id)
        .order_by(SavedGame.created_at.desc(), SavedGame.id.desc())
    )
    return list(db.scalars(stmt).all())


@router.post("/saved-games", response_model=SavedGameOut, status_code=201)
def save_game(
    request: SavedGameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedGame:
    user_id = current_user.id
    game = db.get(Game, request.game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    collection = get_collection_for_request(db, user_id, request.collection_id)
    existing = get_saved_game(db, collection.id, request.game_id)
    if existing is not None:
        return existing

    saved = SavedGame(user_id=user_id, collection_id=collection.id, game_id=request.game_id)
    db.add(saved)
    db.commit()

    created = get_saved_game(db, collection.id, request.game_id)
    if created is None:
        raise HTTPException(status_code=500, detail="Saved game was not persisted")
    return created


@router.delete("/saved-games", status_code=204, response_class=Response)
def clear_saved_games(
    collection_id: int | None = Query(default=None, alias="collectionId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    db.execute(delete(SavedGame).where(SavedGame.collection_id == collection.id))
    db.commit()
    return Response(status_code=204)


@router.delete("/saved-games/{game_id}", status_code=204, response_class=Response)
def delete_saved_game(
    game_id: int,
    collection_id: int | None = Query(default=None, alias="collectionId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    user_id = current_user.id
    collection = get_collection_for_request(db, user_id, collection_id)
    saved = db.scalar(select(SavedGame).where(SavedGame.collection_id == collection.id, SavedGame.game_id == game_id))
    if saved is not None:
        db.delete(saved)
        db.commit()
    return Response(status_code=204)


def get_collection_for_request(db: Session, user_id: str, collection_id: int | None) -> Collection:
    if collection_id is None:
        return get_or_create_default_collection(db, user_id)

    collection = db.get(Collection, collection_id)
    if collection is None or collection.user_id != user_id:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def get_or_create_default_collection(db: Session, user_id: str) -> Collection:
    collection = db.scalar(
        select(Collection).where(Collection.user_id == user_id, Collection.name == DEFAULT_COLLECTION_NAME)
    )
    if collection is not None:
        return collection

    collection = Collection(
        user_id=user_id,
        name=DEFAULT_COLLECTION_NAME,
        description="Games saved for quick comparison.",
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection


def get_saved_game(db: Session, collection_id: int, game_id: int) -> SavedGame | None:
    return db.scalar(
        select(SavedGame)
        .options(joinedload(SavedGame.game))
        .where(SavedGame.collection_id == collection_id, SavedGame.game_id == game_id)
    )
