from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentSourceOut(BaseModel):
    url: str
    checkedOn: str
    scope: str


class GameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    name: str
    price: float
    rating: float
    review_count: int = Field(alias="reviewCount")
    release_year: int = Field(alias="releaseYear")
    developer: str
    publisher: str
    tags: list[str]
    summary: str
    revenue: int
    ownership: int
    content_source: ContentSourceOut | None = Field(default=None, alias="contentSource")
    metrics_kind: Literal["demo", "unknown"] = Field(default="unknown", alias="metricsKind")


class SearchIntentOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title_query: str | None = Field(default=None, alias="titleQuery")
    max_price: float | None = Field(default=None, alias="maxPrice")
    min_rating: float = Field(alias="minRating")
    has_reviews: bool = Field(alias="hasReviews")
    tags: list[str]
    mode: str
    sort_by: str | None = Field(alias="sortBy")
    sort_direction: str = Field(alias="sortDirection")
    limit: int | None = None
    offset: int


class SearchRequest(BaseModel):
    query: str = Field(max_length=500)


class SearchResponse(BaseModel):
    intent: SearchIntentOut
    games: list[GameOut]
    source: str = "rules"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    email: str | None = None
    display_name: str = Field(alias="displayName")
    role: str
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")


class AuthLoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId", min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class AuthRegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str = Field(min_length=1, max_length=255)
    display_name: str = Field(alias="displayName", min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class AuthSessionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    access_token: str = Field(alias="accessToken")
    token_type: str = Field(default="bearer", alias="tokenType")
    expires_in: int = Field(alias="expiresIn")
    user: UserOut


class InsightPanelOut(BaseModel):
    title: str
    caption: str
    body: str
    bullets: list[str]


class GameInsightsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    game_id: int = Field(alias="gameId")
    signal: str
    review_intelligence: InsightPanelOut = Field(alias="reviewIntelligence")
    developer_opportunity: InsightPanelOut = Field(alias="developerOpportunity")
    player_recommendation: InsightPanelOut = Field(alias="playerRecommendation")
    source: str = "rules"


class CollectionCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    purpose: Literal["unspecified", "player", "research"] = "unspecified"


class CollectionUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    purpose: Literal["unspecified", "player", "research"] | None = None


class CollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    user_id: str = Field(alias="userId")
    name: str
    description: str
    purpose: Literal["unspecified", "player", "research"] = "unspecified"
    created_at: datetime = Field(alias="createdAt")


class SavedGameRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    game_id: int = Field(alias="gameId")
    collection_id: int | None = Field(default=None, alias="collectionId")


class SavedGameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    user_id: str = Field(alias="userId")
    collection_id: int = Field(alias="collectionId")
    game_id: int = Field(alias="gameId")
    created_at: datetime = Field(alias="createdAt")
    game: GameOut


class ShortlistInsightsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(alias="userId")
    saved_count: int = Field(alias="savedCount")
    average_price: float | None = Field(alias="averagePrice")
    average_rating: float | None = Field(alias="averageRating")
    total_visible_revenue: int | None = Field(alias="totalVisibleRevenue")
    top_tags: list[str] = Field(alias="topTags")
    strategy: InsightPanelOut
    source: str = "rules"
