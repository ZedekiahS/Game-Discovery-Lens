from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services.game_insights import build_game_insights, get_game_signal


class GameInsightsTests(unittest.TestCase):
    def test_strong_signal_requires_rating_and_review_volume(self) -> None:
        game = SimpleNamespace(rating=4.8, review_count=220)

        self.assertEqual(get_game_signal(game), "Strong")

    def test_build_insights_returns_all_product_panels(self) -> None:
        game = SimpleNamespace(
            id=2,
            name="Celeste",
            price=19.99,
            rating=4.8,
            review_count=312,
            developer="Maddy Makes Games",
            tags=["Platformer", "Difficult", "Story Rich"],
            revenue=62300,
            ownership=4260,
        )

        insights = build_game_insights(game)

        self.assertEqual(insights["game_id"], 2)
        self.assertEqual(insights["signal"], "Strong")
        self.assertEqual(insights["source"], "rules")
        self.assertIn("Catalog evidence", insights["review_intelligence"]["title"])
        self.assertIn("Comparison reference", insights["developer_opportunity"]["title"])
        self.assertIn("Player Recommendation", insights["player_recommendation"]["title"])
