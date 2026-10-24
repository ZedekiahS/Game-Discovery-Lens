from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time

HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 260_000
SALT_BYTES = 16
TOKEN_ALGORITHM = "hmac_sha256"


def hash_password(password: str) -> str:
    salt = secrets.token_hex(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        HASH_ITERATIONS,
    ).hex()
    return f"{HASH_ALGORITHM}${HASH_ITERATIONS}${salt}${digest}"


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False

    try:
        algorithm, iterations, salt, expected_digest = password_hash.split("$", 3)
        if algorithm != HASH_ALGORITHM:
            return False

        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations),
        ).hex()
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(digest, expected_digest)


def create_access_token(user_id: str, secret: str, ttl_seconds: int) -> str:
    expires_at = int(time.time()) + ttl_seconds
    payload = {
        "alg": TOKEN_ALGORITHM,
        "sub": user_id,
        "exp": expires_at,
    }
    encoded_payload = encode_json(payload)
    signature = sign_value(encoded_payload, secret)
    return f"{encoded_payload}.{signature}"


def verify_access_token(token: str, secret: str) -> str | None:
    if not isinstance(token, str) or not token.isascii() or len(token) > 4096:
        return None
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = sign_value(encoded_payload, secret)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(decode_value(encoded_payload))
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None

    if not isinstance(payload, dict) or payload.get("alg") != TOKEN_ALGORITHM:
        return None

    expires_at = payload.get("exp")
    if type(expires_at) is not int or expires_at <= int(time.time()):
        return None

    user_id = payload.get("sub")
    return user_id if isinstance(user_id, str) and user_id else None


def encode_json(value: dict[str, object]) -> str:
    raw_value = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw_value).decode("ascii").rstrip("=")


def decode_value(value: str) -> str:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii")).decode("utf-8")


def sign_value(value: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
