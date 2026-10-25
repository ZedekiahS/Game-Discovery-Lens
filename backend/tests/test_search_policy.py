from __future__ import annotations

import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.schemas import SearchIntentOut
from app.services.ai_search import resolve_search_intent
from app.services.search_intent import parse_search_intent


class SearchPolicyTests(unittest.TestCase):
    def test_free_price_language_is_not_a_title_fragment(self):
        for query in ("Find free FPS games", "Find free-to-play FPS games", "Find free to play FPS games", "找免费的FPS游戏", "Find free FPS games under $20"):
            with self.subTest(query=query):
                intent = parse_search_intent(query, ["FPS"])
                self.assertEqual(intent["max_price"], 0)
                self.assertIsNone(intent["title_query"])
                self.assertEqual(intent["tags"], ["FPS"])

    def test_known_and_quoted_titles_keep_their_price_words(self):
        for title in ("Freeport", "Free to Play", "Fixture Free FPS", "免费午餐"):
            for query, titles in ((title, [title]), (f'"{title}"', [])):
                with self.subTest(query=query):
                    intent = parse_search_intent(query, ["FPS"], titles)
                    self.assertEqual(intent["title_query"], title.lower())
                    self.assertIsNone(intent["max_price"])
                    self.assertEqual(intent["tags"], [])

    def test_all_boundary_intents_meet_the_independent_contract(self):
        fixture = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/search-evaluation-boundaries.json").read_text(encoding="utf-8"))
        titles = [game["name"] for game in fixture["games"]]
        for case in fixture["cases"]:
            with self.subTest(query=case["query"]):
                intent = SearchIntentOut.model_validate(parse_search_intent(case["query"], fixture["availableTags"], titles)).model_dump(by_alias=True)
                self.assertEqual(intent, {"excludedTags": [], **case["expected"]})

    def resolve(self, query, raw, titles=None):
        settings = SimpleNamespace(ai_enabled=True, ai_provider="deepseek", ai_fallback_to_rules=False,
                                   deepseek_api_key="test-only", deepseek_model="test", deepseek_base_url="https://example.invalid", ai_timeout_seconds=1)
        body = json.dumps({"choices": [{"message": {"content": json.dumps(raw)}}]}).encode()
        with patch("app.services.ai_search.urllib.request.urlopen", return_value=io.BytesIO(body)):
            return resolve_search_intent(query, ["FPS", "Story Rich"], settings, titles)

    def test_free_provider_interpretation_does_not_regain_a_spurious_title(self):
        result = self.resolve("Find free FPS games", {"titleQuery": None, "maxPrice": 0, "tags": ["FPS"]})
        self.assertIsNone(result.intent["title_query"])
        self.assertEqual(result.intent["max_price"], 0)
        self.assertEqual(result.source, "deepseek")

    def test_provider_cannot_change_recognized_product_constraints(self):
        cases = [
            ("Find cheap FPS games", {"max_price": 35}),
            ("Find cheap FPS games under $20.99", {"max_price": 20.99}),
            ("Find free FPS games under $20", {"max_price": 0}),
            ("找20美元以下的高评分剧情游戏", {"max_price": 20, "min_rating": 4.4, "has_reviews": True}),
            ("Find top 3 games with most reviews", {"has_reviews": True}),
        ]
        for query, expected in cases:
            with self.subTest(query=query):
                result = self.resolve(query, {"titleQuery": None, "maxPrice": 120, "minRating": 4, "hasReviews": False})
                for key, value in expected.items():
                    self.assertEqual(result.intent[key], value)
                self.assertEqual(result.source, "deepseek")

    def test_policy_checks_ignore_words_inside_known_titles(self):
        result = self.resolve('"Highly Rated"', {"titleQuery": "highly rated", "maxPrice": None, "minRating": 0, "hasReviews": False})
        self.assertEqual(result.intent["min_rating"], 0)
        self.assertFalse(result.intent["has_reviews"])


if __name__ == "__main__":
    unittest.main()
