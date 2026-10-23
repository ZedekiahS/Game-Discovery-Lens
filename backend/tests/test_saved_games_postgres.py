from __future__ import annotations

import os
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from app.config import get_settings
from app.db.database import Base, get_db
from app.db.models import Collection, Game, SavedGame, User
from app.main import app
from app.services.auth import create_access_token
from tests.test_saved_games_routes import PROTECTED_REQUESTS, TestSettings


class SavedGamesPostgresFixture(unittest.TestCase):
    """Opt-in HTTP + real PostgreSQL tests; each test owns a temporary schema."""

    @classmethod
    def setUpClass(cls) -> None:
        database_url = os.getenv("GDL_TEST_DATABASE_URL")
        if not database_url:
            raise unittest.SkipTest("Set GDL_TEST_DATABASE_URL to run PostgreSQL integration tests")
        url = make_url(database_url)
        if url.drivername != "postgresql+psycopg" or url.host not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Integration tests require a local postgresql+psycopg URL")
        if url.query:
            raise ValueError("Integration test URLs must not contain query parameters")
        cls.database_url = url

    def setUp(self) -> None:
        self.schema_name = f"gdl_test_{uuid4().hex}"
        self.admin_engine = create_engine(self.database_url)
        self.addCleanup(self.admin_engine.dispose)
        with self.admin_engine.begin() as connection:
            connection.execute(CreateSchema(self.schema_name))
        self.addCleanup(self.drop_test_schema)

        self.engine = create_engine(
            self.database_url, connect_args={"options": f"-csearch_path={self.schema_name}"}
        )
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        with self.session_factory.begin() as db:
            for game_id in (1, 2):
                db.add(Game(
                    id=game_id, name=f"Test Game {game_id}", price=10, rating=90,
                    review_count=100, release_year=2024, developer="Test Developer",
                    publisher="Test Publisher", tags=["Indie", "Adventure"],
                    summary="An isolated test fixture.", revenue=1000, ownership=100,
                ))

        self.sessions: list[Session] = []

        def test_db():
            with self.session_factory() as db:
                self.sessions.append(db)
                yield db

        self.overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_settings] = TestSettings
        self.addCleanup(self.restore_overrides)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.a = self.register_player("Player A", "a@example.test")
        self.b = self.register_player("Player B", "b@example.test")

    def drop_test_schema(self) -> None:
        # The only schema eligible for cleanup is the UUID-named one created above.
        with self.admin_engine.begin() as connection:
            connection.execute(DropSchema(self.schema_name, cascade=True))

    def restore_overrides(self) -> None:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.overrides)

    def register_player(self, name: str, email: str) -> dict:
        response = self.client.post("/api/auth/register", json={
            "email": email, "displayName": name, "password": "test-password",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def headers(self, account: dict) -> dict[str, str]:
        return {"Authorization": f"Bearer {account['accessToken']}"}

    def save(self, account: dict, game_id: int, collection_id: int | None = None):
        response = self.client.post("/api/saved-games", headers=self.headers(account), json={
            "gameId": game_id, "collectionId": collection_id,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

class SavedGamesPostgresTests(SavedGamesPostgresFixture):
    def test_bulk_read_preserves_memberships_and_cannot_read_another_account(self):
        a = self.headers(self.a)
        first = self.save(self.a, 1)
        folder = self.client.post("/api/collections", headers=a, json={"name": "Second"}).json()
        second = self.save(self.a, 1, folder["id"])
        self.save(self.b, 2)
        response = self.client.get(f"/api/saved-games?allCollections=true&userId={self.b['user']['id']}", headers=a)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({row["id"] for row in response.json()}, {first["id"], second["id"]})
        self.assertEqual(len(self.client.get("/api/saved-games", headers=a).json()), 1)
        self.assertEqual(self.client.get("/api/saved-games?allCollections=true").status_code, 401)
        self.assertEqual(self.client.get(f"/api/saved-games?allCollections=true&collectionId={folder['id']}", headers=a).status_code, 400)

    def test_new_registration_has_personal_default_without_reclassifying_existing_lists(self) -> None:
        response = self.client.get("/api/collections", headers=self.headers(self.a))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["purpose"], "player")
        collection_id = response.json()[0]["id"]
        with self.session_factory.begin() as db:
            db.get(Collection, collection_id).purpose = "unspecified"
        existing = self.client.get("/api/collections", headers=self.headers(self.a))
        self.assertEqual(existing.json()[0]["purpose"], "unspecified")

    def test_login_save_and_reload_in_new_session_with_idempotent_retry(self) -> None:
        login = self.client.post("/api/auth/login", json={"userId": "a@example.test", "password": "test-password"})
        self.assertEqual(login.status_code, 200, login.text)
        account = login.json()
        saved = self.save(account, 1)
        save_session = self.sessions[-1]
        repeated = self.save(account, 1)
        self.assertEqual(repeated["id"], saved["id"])

        with TestClient(app) as refreshed_client:
            response = refreshed_client.get("/api/saved-games", headers=self.headers(account))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["gameId"] for item in response.json()], [1])
        self.assertEqual(response.json()[0]["userId"], account["user"]["id"])
        self.assertIsNot(self.sessions[-1], save_session)
        with self.session_factory() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(SavedGame)), 1)

        for _ in range(2):
            response = self.client.delete("/api/saved-games/1", headers=self.headers(account))
            self.assertEqual(response.status_code, 204, response.text)
        self.assertEqual(self.client.get("/api/saved-games", headers=self.headers(account)).json(), [])

    def test_all_cross_account_collection_operations_are_rejected(self) -> None:
        created = self.client.post("/api/collections", headers=self.headers(self.a), json={"name": "A private list"})
        self.assertEqual(created.status_code, 201, created.text)
        collection_id = created.json()["id"]
        self.save(self.a, 1, collection_id)
        requests = (
            ("PATCH", f"/api/collections/{collection_id}", {"name": "Hijacked"}),
            ("DELETE", f"/api/collections/{collection_id}", None),
            ("GET", f"/api/saved-games?collectionId={collection_id}", None),
            ("GET", f"/api/saved-games/insights?collectionId={collection_id}", None),
            ("POST", "/api/saved-games", {"gameId": 2, "collectionId": collection_id}),
            ("DELETE", f"/api/saved-games?collectionId={collection_id}", None),
            ("DELETE", f"/api/saved-games/1?collectionId={collection_id}", None),
        )
        for method, path, body in requests:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, headers=self.headers(self.b), json=body)
                self.assertEqual(response.status_code, 404, response.text)
        own_lists = self.client.get("/api/collections", headers=self.headers(self.b)).json()
        self.assertNotIn(collection_id, [item["id"] for item in own_lists])
        rows = self.client.get(f"/api/saved-games?collectionId={collection_id}", headers=self.headers(self.a)).json()
        self.assertEqual([item["gameId"] for item in rows], [1])

    def test_forged_body_owner_is_rejected_without_writes(self) -> None:
        collection = self.client.post("/api/collections", headers=self.headers(self.b), json={"name": "B list"}).json()
        for method, path, body in (
            ("POST", "/api/collections", {"name": "Forged"}),
            ("PATCH", f"/api/collections/{collection['id']}", {"name": "Forged"}),
            ("POST", "/api/saved-games", {"gameId": 1}),
        ):
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, headers=self.headers(self.b), json={
                    **body, "userId": self.a["user"]["id"],
                })
                self.assertEqual(response.status_code, 422, response.text)
        with self.session_factory() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(SavedGame)), 0)
            self.assertEqual(db.scalar(select(func.count()).select_from(Collection)), 3)
            self.assertEqual(db.get(Collection, collection["id"]).name, "B list")

    def test_legacy_query_owner_cannot_read_or_delete_another_accounts_data(self) -> None:
        self.save(self.a, 1)
        self.save(self.b, 2)
        spoof = {"userId": self.a["user"]["id"]}
        headers = self.headers(self.b)
        collections = self.client.get("/api/collections", headers=headers, params=spoof).json()
        self.assertTrue(all(item["userId"] == self.b["user"]["id"] for item in collections))
        saved = self.client.get("/api/saved-games", headers=headers, params=spoof).json()
        self.assertEqual([item["gameId"] for item in saved], [2])
        insights = self.client.get("/api/saved-games/insights", headers=headers, params=spoof)
        self.assertEqual(insights.status_code, 200, insights.text)
        self.assertEqual(insights.json()["userId"], self.b["user"]["id"])
        self.assertEqual(insights.json()["savedCount"], 1)
        self.assertEqual(insights.json()["source"], "rules")
        response = self.client.delete("/api/saved-games/1", headers=headers, params=spoof)
        self.assertEqual(response.status_code, 204, response.text)
        response = self.client.delete("/api/saved-games", headers=headers, params=spoof)
        self.assertEqual(response.status_code, 204, response.text)
        self.assertEqual(self.client.get("/api/saved-games", headers=headers).json(), [])
        a_games = self.client.get("/api/saved-games", headers=self.headers(self.a)).json()
        self.assertEqual([item["gameId"] for item in a_games], [1])

    def test_unauthenticated_requests_cannot_change_persisted_data(self) -> None:
        self.save(self.a, 1)
        for method, path, body in PROTECTED_REQUESTS:
            with self.subTest(method=method, path=path):
                response = self.client.request(method, path, params={"userId": self.a["user"]["id"]}, json=body)
                self.assertEqual(response.status_code, 401, response.text)
        response = self.client.post("/api/users/session", json={"userId": "guest-forged"})
        self.assertIn(response.status_code, (404, 405), response.text)
        with self.session_factory() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(User)), 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(Collection)), 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(SavedGame)), 1)

    def test_inactive_and_expired_account_sessions_cannot_save(self) -> None:
        expired = create_access_token(self.a["user"]["id"], TestSettings.auth_secret, -60)
        response = self.client.post("/api/saved-games", json={"gameId": 1}, headers={"Authorization": f"Bearer {expired}"})
        self.assertEqual(response.status_code, 401, response.text)
        with self.session_factory.begin() as db:
            db.get(User, self.a["user"]["id"]).is_active = False
        response = self.client.post("/api/saved-games", json={"gameId": 1}, headers=self.headers(self.a))
        self.assertEqual(response.status_code, 401, response.text)
        with self.session_factory() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(SavedGame)), 0)
            self.assertEqual(db.scalar(select(func.count()).select_from(Collection)), 2)
