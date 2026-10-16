from __future__ import annotations

from typing import Protocol, TypedDict


class InsightGame(Protocol):
    id: int
    name: str
    price: float
    rating: float
    review_count: int
    developer: str
    tags: list[str]
    revenue: int
    ownership: int


class InsightPanel(TypedDict):
    title: str
    caption: str
    body: str
    bullets: list[str]


class GameInsights(TypedDict):
    game_id: int
    signal: str
    review_intelligence: InsightPanel
    developer_opportunity: InsightPanel
    player_recommendation: InsightPanel
    source: str


def build_game_insights(game: InsightGame) -> GameInsights:
    signal = get_game_signal(game)
    primary_tag = game.tags[0] if game.tags else "genre"
    secondary_tags = game.tags[1:3] or game.tags[:1] or ["adjacent audiences"]
    tag_phrase = " and ".join(secondary_tags)

    return {
        "game_id": game.id,
        "signal": signal,
        "review_intelligence": {
            "title": "Review Intelligence",
            "caption": "Rules preview",
            "body": (
                f"{game.name} is showing {sentiment_label(game)} review sentiment. "
                f"The strongest positioning comes from {primary_tag} identity and {tag_phrase} demand."
            ),
            "bullets": [
                f"Common praise: {primary_tag} identity and clear audience fit.",
                f"Review volume: {game.review_count} player reviews available for summarization.",
                f"Recommendation: surface to players who prefer {tag_phrase}.",
            ],
        },
        "developer_opportunity": {
            "title": "Developer Copilot",
            "caption": "Revenue lens",
            "body": (
                f"{game.developer} can use this title as a {signal.lower()} catalog signal with "
                f"{format_compact(game.ownership)} owners and ${format_compact(game.revenue)} visible revenue."
            ),
            "bullets": [
                f"Market signal: {primary_tag} demand is already visible in this seeded catalog.",
                f"Price signal: {price_label(game)} positioning.",
                "Compare this game's genres with the other games in your collection.",
            ],
        },
        "player_recommendation": {
            "title": "Player Recommendation",
            "caption": "Discovery lens",
            "body": (
                f"This is a good match for players who want {primary_tag} and {tag_phrase} with "
                f"a {price_label(game)} price point."
            ),
            "bullets": [
                f"Signal: {signal} based on rating and review volume.",
                f"Price: {format_money(game.price)}.",
                f"Bundle opportunity: pair with adjacent {primary_tag.lower()} games.",
            ],
        },
        "source": "rules",
    }


def get_game_signal(game: InsightGame) -> str:
    if game.rating >= 4.6 and game.review_count >= 150:
        return "Strong"
    if game.rating >= 4.1:
        return "Watch"
    return "Risk"


def sentiment_label(game: InsightGame) -> str:
    if game.rating >= 4.6:
        return "very strong"
    if game.rating >= 4.1:
        return "steady"
    return "mixed"


def price_label(game: InsightGame) -> str:
    if game.price == 0:
        return "free-to-play"
    if game.price <= 25:
        return "accessible"
    return "premium"


def format_money(value: float) -> str:
    return "Free" if value == 0 else f"${value:.2f}"


def format_compact(value: int) -> str:
    if abs(value) >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if abs(value) >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(value)
