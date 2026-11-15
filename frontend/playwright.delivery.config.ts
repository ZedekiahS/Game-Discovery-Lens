import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './delivery', workers: 1, retries: 0, timeout: 60_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4193', trace: 'retain-on-failure' },
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host=127.0.0.1 --port=4193 --strictPort',
    url: 'http://127.0.0.1:4193', reuseExistingServer: false,
  },
});
