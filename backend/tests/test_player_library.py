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
    def test_stale_full_save_and_delete_cannot_erase_new_note_or_recreate_deleted_record(self):
        a = self.headers(self.a)
        path = '/api/me/games/1'
        original = self.client.put(path, headers=a, json={'notes': 'Original', 'expectedUpdatedAt': None}).json()
        newer = self.client.put(path, headers=a, json={'notes': 'Newer note', 'expectedUpdatedAt': original['updatedAt']})
        self.assertEqual(newer.status_code, 200, newer.text)
        self.assertNotEqual(newer.json()['updatedAt'], original['updatedAt'])
        stale = {'status': 'playing', 'notes': 'Original', 'expectedUpdatedAt': original['updatedAt']}
        self.assertEqual(self.client.put(path, headers=a, json=stale).status_code, 409)
        self.assertEqual(self.client.delete(path, headers=a, params={'expectedUpdatedAt': original['updatedAt']}).status_code, 409)
        self.assertEqual(self.client.get('/api/me/games', headers=a).json()[0]['notes'], 'Newer note')
        self.assertEqual(self.client.put(path, headers=a, json={'notes': 'Missing precondition'}).status_code, 422)
        self.assertEqual(self.client.delete(path, headers=a, params={'expectedUpdatedAt': newer.json()['updatedAt']}).status_code, 204)
        self.assertEqual(self.client.put(path, headers=a, json=stale).status_code, 409)
        self.assertEqual(self.client.get('/api/me/games', headers=a).json(), [])

    def test_quick_write_invalidates_full_editor_version_without_touching_notes(self):
        a = self.headers(self.a)
        original = self.client.put('/api/me/games/1', headers=a, json={'notes': 'Keep', 'expectedUpdatedAt': None}).json()
        quick = self.client.patch('/api/me/games/1', headers=a, json={'affinity': 'like'}).json()
        self.assertNotEqual(quick['updatedAt'], original['updatedAt'])
        self.assertEqual(self.client.put('/api/me/games/1', headers=a, json={'notes': 'Stale', 'expectedUpdatedAt': original['updatedAt']}).status_code, 409)
        self.assertEqual(quick['notes'], 'Keep')

    def test_simultaneous_creates_and_edits_have_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from sqlalchemy import event
        a = self.headers(self.a)
        expected = None
        for operation in ('INSERT INTO player_games', 'UPDATE player_games'):
            barrier = Barrier(2)
            def synchronize(_conn, _cursor, statement, _params, _context, _many):
                if statement.startswith(operation):
                    barrier.wait(timeout=10)
            event.listen(self.engine, 'before_cursor_execute', synchronize)
            try:
                def write(note):
                    with TestClient(app) as client:
                        return client.put('/api/me/games/1', headers=a, json={'notes': note, 'expectedUpdatedAt': expected})
                with ThreadPoolExecutor(max_workers=2) as pool:
                    responses = list(pool.map(write, ['First note', 'Second note']))
            finally:
                event.remove(self.engine, 'before_cursor_execute', synchronize)
            self.assertEqual(sorted(r.status_code for r in responses), [200, 409])
            winner = next(r.json() for r in responses if r.status_code == 200)
            self.assertEqual(self.client.get('/api/me/games', headers=a).json(), [winner])
            expected = winner['updatedAt']

    def test_tag_family_preferences_preserve_legacy_reads_and_reject_new_conflicts(self):
        from app.db.models import Game, PlayerPreference
        a = self.headers(self.a)
        with self.session_factory.begin() as db:
            db.get(Game, 1).tags = ['Co-op', 'Survival Horror']
            db.add(PlayerPreference(user_id=self.a['user']['id'], preferred_tags=['Co-op'], avoided_tags=['Multiplayer']))
        legacy = self.client.get('/api/me/preferences', headers=a)
        self.assertEqual(legacy.status_code, 200, legacy.text)
        self.assertEqual(legacy.json()['preferredTags'], ['Co-op'])
        for body in [legacy.json(), {'preferredTags': ['Survival Horror'], 'avoidedTags': ['Horror']}]:
            response = self.client.put('/api/me/preferences', headers=a, json=body)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.get('/api/me/preferences', headers=a).json(), legacy.json())
        # A broad preferred family can still exclude its narrower child.
        body = {'preferredTags': ['Multiplayer'], 'avoidedTags': ['Co-op']}
        response = self.client.put('/api/me/preferences', headers=a, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), body)
        self.assertEqual(self.client.get('/api/me/preferences', headers=self.headers(self.b)).json()['preferredTags'], [])

    def test_quick_changes_preserve_other_fields_and_account_ownership(self):
        a = self.headers(self.a)
        self.client.put("/api/me/games/1", headers=a, json={"status": "playing", "notes": "Keep this note", "expectedUpdatedAt": None})
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
        body = {"status": "playing", "affinity": "like", "notes": "  Finish the next chapter  ", "expectedUpdatedAt": None}
        for _ in range(2):
            response = self.client.put("/api/me/games/1", headers=a, json=body)
            self.assertEqual(response.status_code, 200, response.text)
            body["expectedUpdatedAt"] = response.json()["updatedAt"]
        with TestClient(app) as refreshed:
            rows = refreshed.get("/api/me/games", headers=a).json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["notes"], "Finish the next chapter")
        self.assertEqual(rows[0]["status"], "playing")
        self.assertEqual(self.client.get(f"/api/me/games?userId={self.a['user']['id']}", headers=b).json(), [])
        other = self.client.put("/api/me/games/1", headers=b, json={"affinity": "dislike", "expectedUpdatedAt": None}).json()
        self.client.delete("/api/me/games/1", headers=b, params={"expectedUpdatedAt": other["updatedAt"]})
        self.assertEqual(len(self.client.get("/api/me/games", headers=a).json()), 1)
        saved = self.save(self.a, 1)
        self.client.delete("/api/me/games/1", headers=a, params={"expectedUpdatedAt": rows[0]["updatedAt"]})
        self.assertEqual(self.client.get("/api/me/games", headers=a).json(), [])
        self.assertEqual(self.client.get("/api/saved-games", headers=a).json()[0]["id"], saved["id"])

    def test_invalid_records_and_forged_body_cannot_write(self):
        for body in [{"status": "finished"}, {"affinity": "love"}, {"notes": "x" * 501}, {"userId": self.b["user"]["id"]}]:
            response = self.client.put("/api/me/games/1", headers=self.headers(self.a), json={**body, "expectedUpdatedAt": None})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.put("/api/me/games/9999", headers=self.headers(self.a), json={"expectedUpdatedAt": None}).status_code, 404)
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
