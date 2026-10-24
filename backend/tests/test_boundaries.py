"""Real PostgreSQL regressions for input and query-before-insert boundaries."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from sqlalchemy import event, delete, select, func
from app.db.models import Collection

from app.services.auth import verify_access_token, encode_json, sign_value
from tests.test_saved_games_postgres import SavedGamesPostgresFixture


class BoundaryTests(SavedGamesPostgresFixture):
    def test_malformed_tokens_are_rejected(self):
        response = self.client.get('/api/auth/me', headers=[(b'authorization', b'Bearer payload.\xff')])
        self.assertEqual(response.status_code, 401)
        for token in ("payload.非ASCII", "é.signature", "x", ".", "a.b.c"):
            with self.subTest(token=token):
                self.assertIsNone(verify_access_token(token, "test-secret"))
        for payload in ([], None, {"alg": "hmac_sha256", "exp": True, "sub": "a"}):
            value = encode_json(payload)
            self.assertIsNone(verify_access_token(f"{value}.{sign_value(value, 'test-secret')}", "test-secret"))

    def test_invalid_inputs_are_client_errors(self):
        cases = [
            ("/auth/register", {"email": "long@example.test", "displayName": "x" * 121, "password": "password"}),
            ("/auth/register", {"email": "x" * 250 + "@example.test", "displayName": "Valid", "password": "password"}),
            ("/auth/register", {"email": "valid@example.test", "displayName": "Valid", "password": "x" * 129}),
            ("/collections", {"name": "x" * 121}),
            ("/collections", {"name": "Valid", "description": "x" * 501}),
            ("/search", {"query": "x" * 501}),
        ]
        for path, body in cases:
            with self.subTest(path=path, fields=list(body)):
                # Observe actual HTTP errors instead of raising server exceptions in TestClient.
                from fastapi.testclient import TestClient
                from app.main import app
                with TestClient(app, raise_server_exceptions=False) as client:
                    response = client.post('/api' + path, json=body, headers=self.headers(self.a))
                self.assertTrue(400 <= response.status_code < 500, f"{path}: {response.status_code}")

    def concurrent_posts(self, table, path, bodies):
        barrier = Barrier(2)
        def synchronize(_conn, _cursor, statement, _params, _context, _many):
            if statement.startswith(f"INSERT INTO {table} "):
                barrier.wait(timeout=5)
        from app.services.auth import hash_password
        def synchronized_hash(password):
            barrier.wait(timeout=5)
            return hash_password(password)
        if table != 'users':
            event.listen(self.engine, "before_cursor_execute", synchronize)
        try:
            def post(body):
                from fastapi.testclient import TestClient
                from app.main import app
                with TestClient(app, raise_server_exceptions=False) as client:
                    return client.post('/api' + path, headers=self.headers(self.a), json=body)
            from contextlib import nullcontext
            with patch('app.api.auth.hash_password', synchronized_hash) if table == 'users' else nullcontext():
                with ThreadPoolExecutor(max_workers=2) as pool:
                    return list(pool.map(post, bodies))
        finally:
            if table != 'users':
                event.remove(self.engine, "before_cursor_execute", synchronize)

    def test_concurrent_saves_converge(self):
        responses = self.concurrent_posts('saved_games', '/saved-games', [{"gameId": 1}] * 2)
        self.assertEqual([r.status_code for r in responses], [201, 201])
        self.assertEqual(responses[0].json()['id'], responses[1].json()['id'])

    def test_concurrent_collection_creates_converge(self):
        responses = self.concurrent_posts('collections', '/collections', [{"name": "Concurrent"}] * 2)
        self.assertEqual([r.status_code for r in responses], [201, 201])
        self.assertEqual(responses[0].json()['id'], responses[1].json()['id'])

    def test_concurrent_missing_default_collection_creation_converges(self):
        with self.session_factory.begin() as db:
            db.execute(delete(Collection).where(Collection.user_id == self.a['user']['id']))
        responses = self.concurrent_posts('collections', '/saved-games', [{"gameId": 1}] * 2)
        self.assertEqual([r.status_code for r in responses], [201, 201])
        self.assertEqual(responses[0].json()['id'], responses[1].json()['id'])
        with self.session_factory() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(Collection).where(Collection.user_id == self.a['user']['id'])), 1)

    def test_concurrent_registration_has_explicit_conflict(self):
        body = {"email": "race@example.test", "displayName": "Race", "password": "test-password"}
        responses = self.concurrent_posts('users', '/auth/register', [body] * 2)
        self.assertEqual(sorted(r.status_code for r in responses), [201, 409])
