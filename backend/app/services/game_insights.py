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
            "title": "Catalog evidence", "caption": "Rules preview",
            "body": f"{game.name} is tagged {primary_tag}. No review text is available for analysis.",
            "bullets": [f"Editorial tags: {tag_phrase}.", "A review count is not a review corpus."],
        },
        "developer_opportunity": {
            "title": "Comparison reference", "caption": "Rules preview",
            "body": f"{game.developer}'s title is a comparison reference for {primary_tag}, not evidence of market demand.",
            "bullets": ["Compare this game's genres with the other games in your collection.", "Validate prices and audience metrics independently before making business decisions."],
        },
        "player_recommendation": {
            "title": "Player Recommendation", "caption": "Discovery lens",
            "body": f"Explore this title if you enjoy {primary_tag} and {tag_phrase}. Check the gameplay summary before choosing.",
            "bullets": ["Basis: catalog tags.", "Check the store for current prices and availability."],
        },
        "source": "rules",
    }



def get_game_signal(game: InsightGame) -> str:
    if game.rating >= 4.6 and game.review_count >= 150:
        return "Strong"
    if game.rating >= 4.1:
        return "Watch"
    return "Risk"
