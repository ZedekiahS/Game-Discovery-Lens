import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from app.db.models import Game
from app.schemas import GameOut
from app.scripts.seed import SEED_GAMES

ROOT = Path(__file__).resolve().parents[2]


class ProvenanceTests(unittest.TestCase):
    def test_all_seed_games_keep_sources_and_demo_metrics_in_api_contract(self):
        for row in SEED_GAMES:
            game = Game(**row)
            result = GameOut.model_validate(game).model_dump(by_alias=True)
            self.assertEqual(result['metricsKind'], 'demo')
            self.assertEqual(result['contentSource']['checkedOn'], '2026-10-08')
            self.assertTrue(result['contentSource']['url'].startswith('https://store.steampowered.com/app/'))

    def test_edited_or_unknown_fields_do_not_inherit_unrelated_sources(self):
        game = Game(**SEED_GAMES[0])
        game.summary = 'Unverified replacement'
        game.price = 123456
        result = GameOut.model_validate(game).model_dump(by_alias=True)
        self.assertIsNone(result['contentSource'])
        self.assertEqual(result['metricsKind'], 'unknown')
        self.assertEqual(result['price'], 123456)
        game.id = -123
        self.assertIsNone(game.content_source)


class ConfigurationTests(unittest.TestCase):
    def test_native_root_dotenv_and_process_precedence(self):
        # Run an exact config-module copy in a disposable directory, never read a real .env.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module_path = root / 'backend' / 'app' / 'config.py'
            module_path.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / 'backend/app/config.py', module_path)
            (root / '.env').write_text('GDL_AUTH_SECRET=non-sensitive-sentinel\nGDL_ADMIN_DISPLAY_NAME=Sentinel Admin\nGDL_AI_ENABLED=true\nDEEPSEEK_MODEL=sentinel-model\n', encoding='utf-8')
            with patch.dict(os.environ, {'GDL_AI_ENABLED': 'false'}, clear=True):
                spec = importlib.util.spec_from_file_location('isolated_config', module_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                settings = module.Settings()
                self.assertTrue(settings.auth_secret == 'non-sensitive-sentinel')
                self.assertTrue(settings.admin_display_name == 'Sentinel Admin')
                self.assertTrue(settings.deepseek_model == 'sentinel-model')
                self.assertFalse(settings.ai_enabled)

    @unittest.skipUnless(shutil.which('docker'), 'Docker CLI is needed for Compose config validation')
    def test_compose_passes_documented_settings_without_baking_env_into_image(self):
        keys = ['GDL_AUTH_SECRET', 'GDL_AUTH_TOKEN_TTL_SECONDS', 'GDL_ADMIN_USER_ID', 'GDL_ADMIN_EMAIL',
                'GDL_ADMIN_DISPLAY_NAME', 'GDL_ADMIN_PASSWORD', 'GDL_AI_ENABLED', 'GDL_AI_PROVIDER',
                'GDL_AI_FALLBACK_TO_RULES', 'GDL_AI_TIMEOUT_SECONDS', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL']
        values = {key: f'non-sensitive-sentinel-{i}' for i, key in enumerate(keys)}
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            env_path.write_text('', encoding='utf-8')
            result = subprocess.run(['docker', 'compose', '--env-file', str(env_path), 'config', '--format', 'json'],
                cwd=ROOT, env={**os.environ, **values}, capture_output=True, text=True)
            self.assertTrue(result.returncode == 0, 'Compose configuration validation failed')
            config = json.loads(result.stdout)
            for key in keys:
                self.assertTrue(config['services']['backend']['environment'][key] == values[key], key)
        dockerfile = (ROOT / 'backend/Dockerfile').read_text()
        self.assertNotIn('COPY . ', dockerfile)
        self.assertNotIn('.env', dockerfile)
        self.assertTrue((ROOT / '.dockerignore').read_text().startswith('**'))
