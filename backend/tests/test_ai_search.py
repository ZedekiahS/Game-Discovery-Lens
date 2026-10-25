from __future__ import annotations

import unittest
import io
import json
from types import SimpleNamespace
from unittest.mock import patch

from app.services.ai_search import AIProviderError, resolve_search_intent
from app.services.search_intent import normalize_search_intent

AVAILABLE_TAGS = ["Exploration", "Multiplayer", "Story Rich", "Survival"]


class AISearchTests(unittest.TestCase):
    def test_provider_cannot_invert_an_explicit_exclusion(self):
        with patch('app.services.ai_search.urllib.request.urlopen', return_value=self.provider_response({'tags': ['Multiplayer'], 'excludedTags': []})):
            result = resolve_search_intent('without multiplayer', AVAILABLE_TAGS, self.ai_settings())
        self.assertEqual(result.source, 'deepseek')
        self.assertEqual(result.intent['excluded_tags'], ['Multiplayer'])
        self.assertEqual(result.intent['tags'], [])

    def test_unsupported_negation_never_calls_a_paid_provider(self):
        with patch('app.services.ai_search.urllib.request.urlopen') as provider:
            with self.assertRaisesRegex(ValueError, 'Only game-type exclusions'):
                resolve_search_intent('not free', AVAILABLE_TAGS, self.ai_settings())
            provider.assert_not_called()

    def ai_settings(self, *, fallback: bool = True) -> SimpleNamespace:
        return SimpleNamespace(
            ai_enabled=True, ai_provider="deepseek", ai_fallback_to_rules=fallback,
            deepseek_api_key="test-key-not-a-real-credential", deepseek_model="test-model",
            deepseek_base_url="https://example.invalid", ai_timeout_seconds=1,
        )

    def provider_response(self, intent: dict) -> io.BytesIO:
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": json.dumps(intent)}}]}).encode())

    def test_disabled_ai_uses_rules_provider(self) -> None:
        settings = SimpleNamespace(
            ai_enabled=False,
            ai_provider="deepseek",
            ai_fallback_to_rules=True,
            deepseek_api_key="",
        )

        result = resolve_search_intent("Find cheap multiplayer survival games", AVAILABLE_TAGS, settings)

        self.assertEqual(result.source, "rules")
        self.assertEqual(result.intent["tags"], ["Multiplayer", "Survival"])

    def test_deepseek_without_key_falls_back_to_rules(self) -> None:
        settings = SimpleNamespace(
            ai_enabled=True,
            ai_provider="deepseek",
            ai_fallback_to_rules=True,
            deepseek_api_key="",
        )

        result = resolve_search_intent("Show highly rated story rich games under 25 dollars", AVAILABLE_TAGS, settings)

        self.assertEqual(result.source, "rules")
        self.assertEqual(result.intent["max_price"], 25)
        self.assertEqual(result.intent["tags"], ["Story Rich"])

    def test_provider_title_and_nullable_budget_are_normalized(self) -> None:
        intent = normalize_search_intent({"titleQuery": "  SPACE  Haven ", "maxPrice": None}, [])
        self.assertEqual(intent["title_query"], "space haven")
        self.assertIsNone(intent["max_price"])
        intent = normalize_search_intent({"title_query": "Celeste", "max_price": "20.99"}, [])
        self.assertEqual(intent["title_query"], "celeste")
        self.assertEqual(intent["max_price"], 20.99)

    def test_deepseek_success_keeps_title_filters_and_actual_source(self) -> None:
        with patch("app.services.ai_search.urllib.request.urlopen", return_value=self.provider_response({
            "titleQuery": "Celeste", "maxPrice": 20.99, "tags": ["Story Rich"],
        })) as provider:
            result = resolve_search_intent("Celeste Story Rich under $20.99", AVAILABLE_TAGS, self.ai_settings(), ["Celeste"])
        self.assertEqual(result.source, "deepseek")
        self.assertEqual(result.intent["title_query"], "celeste")
        self.assertEqual(result.intent["max_price"], 20.99)
        self.assertEqual(result.intent["tags"], ["Story Rich"])
        payload = json.loads(provider.call_args.args[0].data)
        self.assertIn('"titleQuery": null | string', payload["messages"][0]["content"])
        self.assertEqual(payload["max_tokens"], 1024)
        self.assertEqual(payload["thinking"], {"type": "disabled"})

    def test_deepseek_missing_or_blank_title_cannot_erase_literal_query(self) -> None:
        for raw in ({}, {"titleQuery": None}, {"titleQuery": "  "}):
            for query, titles in (("DefinitelyNotARealGame", []), ("Find Space Haven", ["Space Haven"])):
                with self.subTest(raw=raw, query=query), patch(
                    "app.services.ai_search.urllib.request.urlopen", return_value=self.provider_response(raw),
                ):
                    result = resolve_search_intent(query, ["Space"], self.ai_settings(), titles)
                    self.assertEqual(result.intent["title_query"], "space haven" if titles else query.lower())
                    self.assertIsNone(result.intent["max_price"])
                    self.assertEqual(result.source, "deepseek")

    def test_deepseek_failures_honor_fallback_and_preserve_known_title(self) -> None:
        for failure in ("timeout", "invalid-json", "invalid-shape"):
            for fallback in (True, False):
                with self.subTest(failure=failure, fallback=fallback):
                    options = {"side_effect": TimeoutError("simulated timeout")} if failure == "timeout" else {
                        "return_value": io.BytesIO(b"not json" if failure == "invalid-json" else b'{"choices": []}'),
                    }
                    with patch("app.services.ai_search.urllib.request.urlopen", **options):
                        if fallback:
                            result = resolve_search_intent("Find Space Haven under $25.50", ["Space"], self.ai_settings(), ["Space Haven"])
                            self.assertEqual(result.source, "rules")
                            self.assertEqual(result.intent["title_query"], "space haven")
                            self.assertEqual(result.intent["max_price"], 25.5)
                            self.assertEqual(result.intent["tags"], [])
                        else:
                            with self.assertRaises(AIProviderError):
                                resolve_search_intent("Celeste", [], self.ai_settings(fallback=False))

    def test_empty_query_uses_unfiltered_rules_without_calling_provider(self) -> None:
        with patch("app.services.ai_search.urllib.request.urlopen") as provider:
            result = resolve_search_intent("  ", AVAILABLE_TAGS, self.ai_settings())
        provider.assert_not_called()
        self.assertIsNone(result.intent["title_query"])
        self.assertIsNone(result.intent["max_price"])
        self.assertEqual(result.source, "rules")
