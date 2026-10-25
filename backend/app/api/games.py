from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.database import get_db
from app.db.models import Game
from app.schemas import GameInsightsOut, GameOut, SearchRequest, SearchResponse
from app.services.ai_search import AIProviderError, resolve_search_intent
from app.services.game_insights import build_game_insights
from app.services.search_intent import SearchIntent, SearchQueryError

router = APIRouter(tags=["games"])


@router.get("/games", response_model=list[GameOut])
def list_games(
    max_price: float | None = Query(default=None, ge=0),
    tag: str | None = Query(default=None),
    has_reviews: bool | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Game]:
    stmt: Select[tuple[Game]] = select(Game).order_by(Game.name)

    if max_price is not None:
        stmt = stmt.where(Game.price <= max_price)
    if tag:
        stmt = stmt.where(Game.tags.contains([tag]))
    if has_reviews:
        stmt = stmt.where(Game.review_count > 0)

    return list(db.scalars(stmt).all())


@router.get("/games/{game_id}", response_model=GameOut)
def get_game(game_id: int, db: Session = Depends(get_db)) -> Game:
    return get_game_or_404(game_id, db)


@router.get("/games/{game_id}/insights", response_model=GameInsightsOut)
def get_game_insights(game_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    game = get_game_or_404(game_id, db)
    return build_game_insights(game)


@router.post("/search", response_model=SearchResponse)
def search_games(request: SearchRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    catalog = db.execute(select(Game.name, Game.tags)).all()
    available_tags = sorted({tag for _, game_tags in catalog for tag in game_tags})
    available_titles = [name for name, _ in catalog]
    try:
        result = resolve_search_intent(request.query, available_tags, get_settings(), available_titles)
    except SearchQueryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    stmt: Select[tuple[Game]] = select(Game)
    stmt = apply_intent_filters(stmt, result.intent)

    return {
        "intent": result.intent,
        "games": list(db.scalars(stmt).all()),
        "source": result.source,
    }


def get_game_or_404(game_id: int, db: Session) -> Game:
    game = db.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


def apply_intent_filters(stmt: Select[tuple[Game]], intent: SearchIntent) -> Select[tuple[Game]]:
    if intent["title_query"]:
        stmt = stmt.where(Game.name.icontains(intent["title_query"], autoescape=True))
    if intent["max_price"] is not None:
        stmt = stmt.where(Game.price <= intent["max_price"])
    stmt = stmt.where(Game.rating >= float(intent["min_rating"]))

    if intent["has_reviews"]:
        stmt = stmt.where(Game.review_count > 0)

    for tag in intent["tags"]:
        stmt = stmt.where(Game.tags.contains([tag]))
    for tag in intent.get("excluded_tags", []):
        stmt = stmt.where(~Game.tags.contains([tag]))

    sort_columns = {
        "name": Game.name,
        "price": Game.price,
        "rating": Game.rating,
        "review_count": Game.review_count,
        "release_year": Game.release_year,
        "revenue": Game.revenue,
        "ownership": Game.ownership,
    }
    sort_column = sort_columns.get(intent["sort_by"] or "name", Game.name)
    primary_sort = sort_column.desc() if intent["sort_direction"] == "desc" else sort_column.asc()
    stmt = stmt.order_by(primary_sort, Game.name.asc())

    if intent["offset"] > 0:
        stmt = stmt.offset(intent["offset"])
    if intent["limit"] is not None:
        stmt = stmt.limit(intent["limit"])

    return stmt
