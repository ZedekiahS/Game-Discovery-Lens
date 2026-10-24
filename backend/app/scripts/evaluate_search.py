"""Opt-in live-provider contract evaluation; always uses an isolated local PG schema."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import copy
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import time
import urllib.error
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from app.api.games import apply_intent_filters
from app.config import get_settings
from app.db.models import Game
from app.schemas import GameOut, SearchIntentOut
from app.services.ai_search import AIProviderError, resolve_search_intent

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "tests/fixtures/search-contract.json"


def score(case: dict, intent: dict, game_ids: list[int]) -> dict:
    mismatches = {}
    for key, expected in case["expected"].items():
        actual = intent.get(key)
        equal = set(actual or []) == set(expected) if key == "tags" else actual == expected
        if not equal:
            mismatches[key] = {"expected": expected, "actual": actual}
    return {
        "intent_pass": not mismatches,
        "results_pass": game_ids == case["gameIds"],
        "both_pass": not mismatches and game_ids == case["gameIds"],
        "mismatches": mismatches,
    }


def summarize(results: list[dict]) -> dict:
    latencies = sorted(row["latency_ms"] for row in results)
    return {
        "count": len(results),
        "intent_pass": sum(row["intent_pass"] for row in results),
        "results_pass": sum(row["results_pass"] for row in results),
        "both_pass": sum(row["both_pass"] for row in results),
        "latency_ms": {
            "median": round(statistics.median(latencies), 3) if latencies else None,
            "p95_nearest_rank": latencies[math.ceil(len(latencies) * .95) - 1] if latencies else None,
        },
    }


def provider_error_kind(exc: AIProviderError) -> str:
    cause = exc.__cause__
    if isinstance(cause, urllib.error.HTTPError):
        return f"http_{cause.code}"
    if isinstance(cause, TimeoutError):
        return "timeout"
    if isinstance(cause, urllib.error.URLError):
        return "transport_error"
    return "invalid_response"


@contextmanager
def fixture_database(database_url: str, games: list[dict]):
    url = make_url(database_url)
    if url.drivername != "postgresql+psycopg" or url.host not in {"localhost", "127.0.0.1", "::1"} or url.query:
        raise ValueError("Use a loopback postgresql+psycopg test URL with no query parameters")
    schema = f"gdl_eval_{uuid4().hex}"
    admin = create_engine(url)
    engine = None
    created = False
    try:
        with admin.begin() as connection:
            connection.execute(CreateSchema(schema))
        created = True
        engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        Game.__table__.create(engine)
        with Session(engine) as db:
            db.add_all(Game(**GameOut.model_validate(game).model_dump(exclude={"content_source", "metrics_kind"})) for game in games)
            db.commit()
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if created:
            with admin.begin() as connection:
                connection.execute(DropSchema(schema, cascade=True))
        admin.dispose()


def evaluate_case(case: dict, settings, engine, tags: list[str], titles: list[str]) -> dict:
    started = time.perf_counter()
    error = None
    strict = copy(settings)
    strict.ai_fallback_to_rules = False
    # Observe a provider error separately, then execute the application's rule resolver.
    # A successful fallback is product recovery, never a successful model interpretation.
    try:
        parsed = resolve_search_intent(case["query"], tags, strict, titles)
    except AIProviderError as exc:
        error = provider_error_kind(exc)
        fallback = copy(settings)
        fallback.ai_enabled = False
        parsed = resolve_search_intent(case["query"], tags, fallback, titles)
    latency_ms = round((time.perf_counter() - started) * 1000, 3)
    intent = SearchIntentOut.model_validate(parsed.intent).model_dump(by_alias=True)
    with Session(engine) as db:
        game_ids = [game.id for game in db.scalars(apply_intent_filters(select(Game), parsed.intent))]
    return {
        "source": parsed.source,
        "provider_attempted": settings.ai_enabled and bool(case["query"].strip()),
        "fallback": error is not None,
        "error": error,
        "latency_ms": latency_ms,
        "intent": intent,
        "game_ids": game_ids,
        **score(case, intent, game_ids),
    }


def evaluate(fixture: dict, settings, engine, *, live: bool, max_calls: int) -> dict:
    # Match the production route's actual catalog context, not the fixture's larger tag list.
    tags = sorted({tag for game in fixture["games"] for tag in game["tags"]})
    titles = [game["name"] for game in fixture["games"]]
    rules_settings = copy(settings)
    rules_settings.ai_enabled = False
    rules_settings.ai_provider = "rules"
    live_settings = copy(settings)
    live_settings.ai_enabled = True
    live_settings.ai_provider = "deepseek"
    rows = []
    calls = consecutive_failures = 0
    stopped = None
    for index, case in enumerate(fixture["cases"], start=1):
        row = {"case": index, "query": case["query"], "expected": case["expected"], "expected_game_ids": case["gameIds"]}
        row["rules"] = evaluate_case(case, rules_settings, engine, tags, titles)
        row["deepseek"] = None
        if live and stopped is None:
            if case["query"].strip() and calls >= max_calls:
                stopped = "call_limit"
            else:
                result = evaluate_case(case, live_settings, engine, tags, titles)
                row["deepseek"] = result
                calls += int(result["provider_attempted"])
                if result["provider_attempted"]:
                    consecutive_failures = consecutive_failures + 1 if result["fallback"] else 0
                if result["error"] in {"http_400", "http_401", "http_402", "http_403", "http_404", "http_422", "http_429"}:
                    stopped = result["error"]
                elif consecutive_failures >= 3:
                    stopped = "three_consecutive_provider_failures"
        rows.append(row)
        result = row["deepseek"]
        progress = f"{result['source']} both_pass={result['both_pass']} error={result['error']}" if result else "not requested or stopped"
        print(f"Case {index}/{len(fixture['cases'])}: rules={row['rules']['both_pass']}; deepseek={progress}", flush=True)
    live_results = [row["deepseek"] for row in rows if row["deepseek"] is not None]
    attempts = [result for result in live_results if result["provider_attempted"]]
    return {
        "actual_catalog_tags": tags,
        "rules": summarize([row["rules"] for row in rows]),
        "deepseek_integration": summarize([result for result in attempts if result["source"] == "deepseek"]),
        "live_product_including_fallback": summarize(live_results),
        "provider_calls": calls,
        "fallback_count": sum(result["fallback"] for result in attempts),
        "blank_bypasses": sum(not result["provider_attempted"] for result in live_results),
        "not_run": len(rows) - len(live_results),
        "stopped_reason": stopped,
        "cases": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Opt in to paid DeepSeek requests (no retries)")
    parser.add_argument("--max-calls", type=int, default=21, help="Maximum paid attempts; default 21 for 22 cases including one blank")
    parser.add_argument("--fixture", type=Path, default=FIXTURE, help="JSON catalog and expected cases; defaults to the shared regression contract")
    parser.add_argument("--model", help="Explicit provider model override; does not change .env")
    parser.add_argument("--output", type=Path, required=True, help="New JSON evidence file; existing files are never overwritten")
    args = parser.parse_args()
    if not 1 <= args.max_calls <= 50:
        parser.error("--max-calls must be between 1 and 50")
    if args.output.exists():
        parser.error("Output already exists; choose a new evidence path")
    database_url = os.environ.get("GDL_TEST_DATABASE_URL")
    if not database_url:
        parser.error("Set GDL_TEST_DATABASE_URL to a local PostgreSQL database; the evaluator isolates its own schema")
    settings = get_settings()
    settings = copy(settings)
    if args.model:
        settings.deepseek_model = args.model
    if args.live:
        if not settings.deepseek_api_key:
            parser.error("DEEPSEEK_API_KEY is not configured")
        endpoint = urlsplit(settings.deepseek_base_url)
        if endpoint.scheme != "https" or endpoint.netloc != "api.deepseek.com" or endpoint.path.rstrip('/') not in {'', '/v1'} or endpoint.query or endpoint.fragment:
            parser.error("Live evaluation sends credentials only to https://api.deepseek.com or its /v1 path")
    fixture_path = args.fixture.resolve()
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Reserve output before paid calls so invalid/unwritable paths fail without consuming calls.
    with args.output.open("x", encoding="utf-8") as output:
        revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        report = {
            "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
            "base_commit": revision,
            "fixture": fixture_path.relative_to(ROOT).as_posix() if fixture_path.is_relative_to(ROOT) else fixture_path.name,
            "game_count": len(fixture["games"]),
            "provider_mode": "live" if args.live else "rules-only",
            "model_requested": settings.deepseek_model if args.live else None,
            "timeout_seconds": settings.ai_timeout_seconds,
            "max_output_tokens": 1024,
            "thinking": "disabled",
            "max_calls": args.max_calls,
            "notes": ["Single pass on a selected fixture, not a general model benchmark.", "Provider integration includes normalization, recognized product constraints and a rules-based title guard.", "The prompt includes catalog titles as well as available tags.", "Latency measures intent resolution, excluding SQL/browser rendering.", "Usage and actual billing were not collected.", "Only expected fields are scored; tag order is ignored, result ID order is strict."],
        }
        with fixture_database(database_url, fixture["games"]) as engine:
            report.update(evaluate(fixture, settings, engine, live=args.live, max_calls=args.max_calls))
        report["isolated_schema_removed"] = True
        json.dump(report, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(json.dumps({key: report[key] for key in ("rules", "deepseek_integration", "provider_calls", "fallback_count", "stopped_reason")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
