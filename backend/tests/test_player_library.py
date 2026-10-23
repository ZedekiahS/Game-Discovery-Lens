import unittest
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from app.main import app
from tests.test_saved_games_postgres import SavedGamesPostgresFixture
from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateSchema, DropSchema


class PlayerLibraryAuthTests(unittest.TestCase):
    def test_private_endpoints_require_authentication(self):
        with TestClient(app) as client:
            for method, path, body in [
                ("GET", "/me/games", None), ("PUT", "/me/games/1", {"status": "played"}),
                ("DELETE", "/me/games/1", None), ("GET", "/me/preferences", None),
                ("PATCH", "/me/games/1", {"affinity": "like"}),
                ("PUT", "/me/preferences", {"preferredTags": []}),
            ]:
                with self.subTest(path=path, method=method):
                    self.assertEqual(client.request(method, f"/api{path}", json=body).status_code, 401)


class PlayerLibraryPostgresTests(SavedGamesPostgresFixture):
    def test_quick_changes_preserve_other_fields_and_account_ownership(self):
        a = self.headers(self.a)
        self.client.put("/api/me/games/1", headers=a, json={"status": "playing", "notes": "Keep this note"})
        response = self.client.patch("/api/me/games/1", headers=a, json={"affinity": "like"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((response.json()["status"], response.json()["notes"]), ("playing", "Keep this note"))
        self.client.patch("/api/me/games/1", headers=a, json={"status": None})
        rows = self.client.get("/api/me/games", headers=a).json()
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["status"], rows[0]["affinity"], rows[0]["notes"]), (None, "like", "Keep this note"))
        response = self.client.patch(f"/api/me/games/1?userId={self.a['user']['id']}", headers=self.headers(self.b), json={"status": "want_to_play"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["notes"], "")
        self.assertEqual(self.client.get("/api/me/games", headers=a).json(), rows)

    def test_quick_changes_reject_unknown_fields_empty_payloads_and_missing_games(self):
        for body in [{}, {"affinity": None}, {"notes": "Overwrite"}, {"status": "finished"}, {"userId": self.b["user"]["id"]}]:
            response = self.client.patch("/api/me/games/1", headers=self.headers(self.a), json=body)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.patch("/api/me/games/9999", headers=self.headers(self.a), json={"affinity": "like"}).status_code, 404)
        self.assertEqual(self.client.get("/api/me/games", headers=self.headers(self.a)).json(), [])

    def test_migration_preserves_existing_collections_and_records_start_empty(self):
        schema = f"gdl_migration_{uuid4().hex}"
        with self.admin_engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        engine = create_engine(self.database_url, connect_args={"options": f"-csearch_path={schema}"})
        env = {**os.environ, "GDL_DATABASE_URL": self.database_url.render_as_string(hide_password=False), "PGOPTIONS": f"-csearch_path={schema}"}
        try:
            for revision in ["0004_create_users", "head"]:
                result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision], cwd=Path(__file__).parents[1], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                if revision == "0004_create_users":
                    with engine.begin() as db:
                        db.execute(text("INSERT INTO collections (user_id, name, description) VALUES ('existing-player', 'My list', 'Keep this note')"))
            with engine.connect() as db:
                row = db.execute(text("SELECT name, description, purpose FROM collections WHERE user_id='existing-player'")).one()
                self.assertEqual(tuple(row), ("My list", "Keep this note", "unspecified"))
                self.assertEqual(db.scalar(text("SELECT count(*) FROM player_games")), 0)
                self.assertEqual(db.scalar(text("SELECT count(*) FROM player_preferences")), 0)
        finally:
            engine.dispose()
            with self.admin_engine.begin() as connection:
                connection.execute(DropSchema(schema, cascade=True))

    def test_records_survive_reload_and_stay_private_even_with_forged_query(self):
        a = self.headers(self.a)
        b = self.headers(self.b)
        body = {"status": "playing", "affinity": "like", "notes": "  Finish the next chapter  "}
        for _ in range(2):
            response = self.client.put("/api/me/games/1", headers=a, json=body)
            self.assertEqual(response.status_code, 200, response.text)
        with TestClient(app) as refreshed:
            rows = refreshed.get("/api/me/games", headers=a).json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["notes"], "Finish the next chapter")
        self.assertEqual(rows[0]["status"], "playing")
        self.assertEqual(self.client.get(f"/api/me/games?userId={self.a['user']['id']}", headers=b).json(), [])
        self.client.put("/api/me/games/1", headers=b, json={"affinity": "dislike"})
        self.client.delete("/api/me/games/1", headers=b)
        self.assertEqual(len(self.client.get("/api/me/games", headers=a).json()), 1)
        saved = self.save(self.a, 1)
        self.client.delete("/api/me/games/1", headers=a)
        self.assertEqual(self.client.get("/api/me/games", headers=a).json(), [])
        self.assertEqual(self.client.get("/api/saved-games", headers=a).json()[0]["id"], saved["id"])

    def test_invalid_records_and_forged_body_cannot_write(self):
        for body in [{"status": "finished"}, {"affinity": "love"}, {"notes": "x" * 501}, {"userId": self.b["user"]["id"]}]:
            response = self.client.put("/api/me/games/1", headers=self.headers(self.a), json=body)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.put("/api/me/games/9999", headers=self.headers(self.a), json={}).status_code, 404)
        self.assertEqual(self.client.get("/api/me/games", headers=self.headers(self.a)).json(), [])

    def test_preferences_can_be_changed_cleared_and_not_read_by_other_account(self):
        a = self.headers(self.a)
        body = {"preferredTags": ["Adventure", "Adventure"], "avoidedTags": ["Indie"]}
        response = self.client.put("/api/me/preferences", headers=a, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/api/me/preferences", headers=a).json()["preferredTags"], ["Adventure"])
        self.assertEqual(self.client.get("/api/me/preferences", headers=self.headers(self.b)).json()["preferredTags"], [])
        for invalid, status in [({"preferredTags": ["Unknown"]}, 400), ({"preferredTags": ["Indie"], "avoidedTags": ["Indie"]}, 422), ({"userId": "someone"}, 422)]:
            self.assertEqual(self.client.put("/api/me/preferences", headers=a, json=invalid).status_code, status)
        self.assertEqual(self.client.put("/api/me/preferences", headers=a, json={}).status_code, 200)
        self.assertEqual(self.client.get("/api/me/preferences", headers=a).json()["preferredTags"], [])

    def test_collection_purpose_is_explicit_and_can_change_without_losing_saves(self):
        a = self.headers(self.a)
        collection = self.client.get("/api/collections", headers=a).json()[0]
        self.assertEqual(collection["purpose"], "player")
        self.save(self.a, 1, collection["id"])
        response = self.client.patch(f"/api/collections/{collection['id']}", headers=a, json={"name": collection["name"], "purpose": "research"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["purpose"], "research")
        self.assertEqual(len(self.client.get("/api/saved-games", headers=a).json()), 1)
        research = self.client.post("/api/collections", headers=a, json={"name": "References", "purpose": "research"})
        self.assertEqual(research.json()["purpose"], "research")
