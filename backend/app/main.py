from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.games import router as games_router
from app.api.saved_games import router as saved_games_router
from app.api.users import router as users_router
from app.api.player_library import router as player_library_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Game Discovery Lens API",
    description="Backend API for Game Discovery Lens game intelligence.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(games_router, prefix="/api")
app.include_router(saved_games_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(player_library_router, prefix="/api")
