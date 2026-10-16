"""Run the real API with migrated, isolated PostgreSQL data for browser tests."""
from pathlib import Path
from uuid import uuid4
import os
import secrets
import subprocess
import sys

from sqlalchemy import create_engine
from sqlalchemy.schema import CreateSchema, DropSchema


def main() -> None:
    database_url = os.environ.get("GDL_E2E_DATABASE_URL")
    if not database_url:
        raise SystemExit("Set GDL_E2E_DATABASE_URL to a local test PostgreSQL database.")
    schema = f"gdl_e2e_{uuid4().hex}"
    admin = create_engine(database_url)
    with admin.begin() as connection:
        connection.execute(CreateSchema(schema))
    os.environ.update({
        "GDL_DATABASE_URL": database_url,
        "PGOPTIONS": f"-csearch_path={schema}",
        "GDL_AI_ENABLED": "false",
        "GDL_AI_PROVIDER": "rules",
        "GDL_AUTH_SECRET": secrets.token_urlsafe(32),
        "GDL_CORS_ORIGINS": "http://127.0.0.1:4191",
    })
    try:
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                       cwd=Path(__file__).resolve().parents[1], check=True)
        from app.db.database import SessionLocal, engine
        from app.scripts.seed import seed_games
        with SessionLocal() as db:
            seed_games(db)
        import uvicorn
        try:
            uvicorn.run("app.main:app", host="127.0.0.1", port=8011)
        finally:
            engine.dispose()
    finally:
        with admin.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
        admin.dispose()


if __name__ == "__main__":
    main()
