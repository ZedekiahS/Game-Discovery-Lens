from __future__ import annotations

from collections import Counter
from typing import Protocol, TypedDict


class ShortlistGame(Protocol):
    name: str
    price: float
    rating: float
    tags: list[str]
    revenue: int


class SavedGameLike(Protocol):
    game: ShortlistGame


class InsightPanel(TypedDict):
    title: str
    caption: str
    body: str
    bullets: list[str]


class ShortlistInsights(TypedDict):
    user_id: str
    saved_count: int
    average_price: float | None
    average_rating: float | None
    total_visible_revenue: int | None
    top_tags: list[str]
    strategy: InsightPanel
    source: str


def build_shortlist_insights(saved_games: list[SavedGameLike], user_id: str) -> ShortlistInsights:
    games = [saved_game.game for saved_game in saved_games]
    saved_count = len(games)

    if saved_count == 0:
        return {
            "user_id": user_id,
            "saved_count": 0,
            "average_price": None,
            "average_rating": None,
            "total_visible_revenue": None,
            "top_tags": [],
            "strategy": {
                "title": "Collection Intelligence",
                "caption": "Rules preview",
                "body": "Save games to this collection to compare gameplay and genre concentration.",
                "bullets": [
                    "Start with two or three games from different tags.",
                    "Use collections to separate player wishlists from developer research.",
                    "Check each game’s source before drawing conclusions.",
                ],
            },
            "source": "rules",
        }

    average_price = sum(game.price for game in games) / saved_count
    average_rating = sum(game.rating for game in games) / saved_count
    total_visible_revenue = sum(game.revenue for game in games)
    top_tags = [tag for tag, _ in Counter(tag for game in games for tag in game.tags).most_common(4)]
    tag_phrase = ", ".join(top_tags[:3]) if top_tags else "mixed genres"

    return {
        "user_id": user_id,
        "saved_count": saved_count,
        "average_price": round(average_price, 2),
        "average_rating": round(average_rating, 2),
        "total_visible_revenue": total_visible_revenue,
        "top_tags": top_tags,
        "strategy": {
            "title": "Collection Intelligence",
            "caption": "Rules preview",
            "body": (
                f"This collection groups {tag_phrase}. Compare gameplay and tags; market demand has not been established."
            ),
            "bullets": [
                f"Saved games: {saved_count}.",
                f"Average price: {format_money(average_price)}.",
                f"Catalog revenue total: ${format_compact(total_visible_revenue)}.",
                f"Top tags: {tag_phrase}.",
            ],
        },
        "source": "rules",
    }


def format_money(value: float) -> str:
    return "Free" if value == 0 else f"${value:.2f}"


def format_compact(value: int) -> str:
    if abs(value) >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if abs(value) >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(value)
