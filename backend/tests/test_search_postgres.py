from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from app.db.database import get_db
from app.db.models import Game
from app.main import app
from app.schemas import GameOut


class SearchPostgresTests(unittest.TestCase):
    """Execute the shared search contract through HTTP against an isolated schema."""

    fixture_filename = "search-contract.json"

    @classmethod
    def setUpClass(cls) -> None:
        database_url = os.getenv("GDL_TEST_DATABASE_URL")
        if not database_url:
            raise unittest.SkipTest("Set GDL_TEST_DATABASE_URL to run PostgreSQL integration tests")
        url = make_url(database_url)
        if url.drivername != "postgresql+psycopg" or url.host not in {"localhost", "127.0.0.1", "::1"} or url.query:
            raise ValueError("Search integration tests require a local postgresql+psycopg URL without query parameters")
        cls.schema_name = f"gdl_search_test_{uuid4().hex}"
        cls.admin_engine = create_engine(url)
        cls.addClassCleanup(cls.admin_engine.dispose)
        with cls.admin_engine.begin() as connection:
            connection.execute(CreateSchema(cls.schema_name))
        cls.addClassCleanup(cls.drop_test_schema)
        cls.engine = create_engine(url, connect_args={"options": f"-csearch_path={cls.schema_name}"})
        cls.addClassCleanup(cls.engine.dispose)
        Game.__table__.create(cls.engine)
        cls.session_factory = sessionmaker(bind=cls.engine)
        cls.fixture = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures" / cls.fixture_filename).read_text(encoding="utf-8"))
        with cls.session_factory.begin() as db:
            for game in cls.fixture["games"]:
                db.add(Game(**GameOut.model_validate(game).model_dump(exclude={"content_source", "metrics_kind"})))

    @classmethod
    def drop_test_schema(cls) -> None:
        with cls.admin_engine.begin() as connection:
            connection.execute(DropSchema(cls.schema_name, cascade=True))

    def setUp(self) -> None:
        def test_db():
            with self.session_factory() as db:
                yield db
        self.overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = test_db
        self.addCleanup(self.restore_overrides)
        settings_patch = patch("app.api.games.get_settings", return_value=SimpleNamespace(ai_enabled=False, ai_provider="rules"))
        settings_patch.start()
        self.addCleanup(settings_patch.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def restore_overrides(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.overrides)

    def test_shared_search_contract_returns_matching_games(self) -> None:
        for case in self.fixture["cases"]:
            with self.subTest(query=case["query"]):
                response = self.client.post("/api/search", json={"query": case["query"]})
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result["source"], "rules")
                for key, expected in case["expected"].items():
                    self.assertEqual(result["intent"][key], expected, key)
                self.assertEqual([game["id"] for game in result["games"]], case["gameIds"])


class BoundarySearchPostgresTests(SearchPostgresTests):
    fixture_filename = "search-evaluation-boundaries.json"


class IndependentSearchPostgresTests(SearchPostgresTests):
    fixture_filename = "search-evaluation-unseen.json"
