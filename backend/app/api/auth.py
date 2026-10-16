from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.database import get_db
from app.db.models import Collection, User
from app.schemas import AuthLoginRequest, AuthRegisterRequest, AuthSessionOut, UserOut
from app.services.auth import create_access_token, hash_password, verify_access_token, verify_password

router = APIRouter(tags=["auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/auth/login", response_model=AuthSessionOut)
def login(
    request: AuthLoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    user = get_user_by_login_identifier(db, request.user_id)
    if user is None or not user.is_active or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user id or password")

    access_token = create_access_token(user.id, settings.auth_secret, settings.auth_token_ttl_seconds)
    return {
        "accessToken": access_token,
        "tokenType": "bearer",
        "expiresIn": settings.auth_token_ttl_seconds,
        "user": user,
    }


@router.post("/auth/register", response_model=AuthSessionOut, status_code=status.HTTP_201_CREATED)
def register(
    request: AuthRegisterRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    email = normalize_email(request.email)
    display_name = request.display_name.strip()
    password = request.password

    if not display_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Display name is required")
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is invalid")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        id=create_player_user_id(db, display_name, email),
        email=email,
        display_name=display_name,
        role="player",
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    # Only new registrations get a personal default; legacy collections keep their purpose.
    db.add(Collection(user_id=user.id, name="Default Shortlist", purpose="player"))
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id, settings.auth_secret, settings.auth_token_ttl_seconds)
    return {
        "accessToken": access_token,
        "tokenType": "bearer",
        "expiresIn": settings.auth_token_ttl_seconds,
        "user": user,
    }


@router.get("/auth/me", response_model=UserOut)
def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    token = parse_bearer_token(authorization)
    user_id = verify_access_token(token, settings.auth_secret)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is not active")
    return user


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_login_identifier(db: Session, identifier: str) -> User | None:
    normalized_identifier = identifier.strip()
    if not normalized_identifier:
        return None

    user = db.get(User, normalized_identifier)
    if user is not None:
        return user

    return db.scalar(select(User).where(User.email == normalize_email(normalized_identifier)))


def create_player_user_id(db: Session, display_name: str, email: str) -> str:
    preferred_source = display_name or email.partition("@")[0]
    base = re.sub(r"[^a-z0-9]+", "-", preferred_source.lower()).strip("-")[:36] or "player"
    candidate = base
    suffix = 2
    while db.get(User, candidate) is not None:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def parse_bearer_token(authorization: str | None) -> str:
    if authorization is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Expected bearer token")
    return token
