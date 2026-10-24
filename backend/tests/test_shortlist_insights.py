from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services.shortlist_insights import build_shortlist_insights


class ShortlistInsightsTests(unittest.TestCase):
    def test_empty_shortlist_returns_guidance(self) -> None:
        insights = build_shortlist_insights([], "demo-user")

        self.assertEqual(insights["saved_count"], 0)
        self.assertIsNone(insights["average_price"])
        self.assertEqual(insights["top_tags"], [])
        self.assertIn("Save games", insights["strategy"]["body"])

    def test_shortlist_insights_aggregate_saved_games(self) -> None:
        saved_games = [
            SimpleNamespace(
                game=SimpleNamespace(
                    name="Celeste",
                    price=19.99,
                    rating=4.8,
                    tags=["Platformer", "Story Rich"],
                    revenue=62300,
                )
            ),
            SimpleNamespace(
                game=SimpleNamespace(
                    name="SIGNALIS",
                    price=19.99,
                    rating=4.6,
                    tags=["Survival Horror", "Story Rich"],
                    revenue=36400,
                )
            ),
        ]

        insights = build_shortlist_insights(saved_games, "demo-user")

        self.assertEqual(insights["saved_count"], 2)
        self.assertEqual(insights["average_price"], 19.99)
        self.assertEqual(insights["average_rating"], 4.7)
        self.assertEqual(insights["total_visible_revenue"], 98700)
        self.assertEqual(insights["top_tags"][0], "Story Rich")
