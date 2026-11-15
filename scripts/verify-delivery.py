"""Verify the shipped image and optionally the built UI using a disposable Docker database.

Requires Docker; --browser also requires frontend npm ci and Playwright Chromium.
Never reads the project's .env or connects to an existing database.
"""
from pathlib import Path
from uuid import uuid4
import argparse
import json
import os
import shutil
import subprocess
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', action='store_true')
    args = parser.parse_args()
    prefix = f'gdl-delivery-{uuid4().hex[:12]}'
    image, database, api = f'{prefix}:test', f'{prefix}-db', f'{prefix}-api'
    # Non-sensitive sentinels used only in this disposable network. No provider calls.
    settings = {
        'GDL_DATABASE_URL': f'postgresql+psycopg://gdl_test:delivery-test-only@{database}:5432/gdl_test',
        'GDL_CORS_ORIGINS': 'http://127.0.0.1:4193',
        'GDL_AUTH_SECRET': 'delivery-auth-sentinel',
        'GDL_ADMIN_PASSWORD': 'delivery-admin-sentinel',
        'GDL_AI_ENABLED': 'false', 'GDL_AI_PROVIDER': 'rules',
        'DEEPSEEK_API_KEY': 'delivery-unused-sentinel',
        'DEEPSEEK_MODEL': 'delivery-model-sentinel',
    }
    environment = [value for key, val in settings.items() for value in ('-e', f'{key}={val}')]
    try:
        run('docker', 'build', '-f', 'backend/Dockerfile', '-t', image, '.')
        # Import exercises real startup dependencies, including shared catalog/tag files.
        run('docker', 'run', '--rm', '-i', *environment, image, 'python', '-', input='''
from pathlib import Path
from app.main import app
from app.config import get_settings
from app.scripts.seed import SEED_GAMES
s = get_settings()
assert len(SEED_GAMES) == 80
assert s.auth_secret == 'delivery-auth-sentinel'
assert s.admin_password == 'delivery-admin-sentinel'
assert s.deepseek_api_key == 'delivery-unused-sentinel'
assert s.deepseek_model == 'delivery-model-sentinel'
assert not s.ai_enabled and s.ai_provider == 'rules'
assert not list(Path('/workspace').rglob('.env*'))
print('Image import, bundled catalog, runtime config and environment exclusion passed.')
''', text=True)
        run('docker', 'network', 'create', prefix, stdout=subprocess.DEVNULL)
        run('docker', 'run', '-d', '--name', database, '--network', prefix,
            '-e', 'POSTGRES_USER=gdl_test', '-e', 'POSTGRES_PASSWORD=delivery-test-only',
            '-e', 'POSTGRES_DB=gdl_test', 'postgres:16', stdout=subprocess.DEVNULL)
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', database, 'pg_isready', '-U', 'gdl_test', '-d', 'gdl_test'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Disposable PostgreSQL did not become ready')
        for command in [('alembic', 'upgrade', 'head'), ('python', '-m', 'app.scripts.seed')]:
            run('docker', 'run', '--rm', '--network', prefix, *environment, image, *command)
        run('docker', 'run', '-d', '--name', api, '--network', prefix, '-p', '127.0.0.1:8013:8000',
            *environment, image, stdout=subprocess.DEVNULL)
        for _ in range(60):
            try:
                with urlopen('http://127.0.0.1:8013/api/games', timeout=2) as response:
                    games = json.load(response)
                assert len(games) == 80
                assert all(g['metricsKind'] == 'demo' and g['contentSource'] for g in games)
                break
            except OSError:
                time.sleep(1)
        else:
            raise RuntimeError('Packaged API did not become ready')
        print('Packaged migrations, seed and real HTTP catalog read passed.', flush=True)
        if args.browser:
            frontend = ROOT / 'frontend'
            env = {**os.environ, 'VITE_API_BASE_URL': 'http://127.0.0.1:8013/api', 'VITE_DATA_MODE': 'api'}
            subprocess.run([shutil.which('npm'), 'run', 'build'], cwd=frontend, env=env, check=True)
            subprocess.run([shutil.which('npx'), 'playwright', 'test', '--config', 'playwright.delivery.config.ts'], cwd=frontend, env=env, check=True)
    finally:
        # Exact names allocated above: no compose down, volume purge or shared database cleanup.
        for name in (api, database):
            subprocess.run(['docker', 'rm', '-f', '-v', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['docker', 'network', 'rm', prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['docker', 'image', 'rm', image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
