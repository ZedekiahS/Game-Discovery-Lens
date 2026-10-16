import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const localPython = process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
const python = process.env.GDL_E2E_PYTHON || (existsSync(`../backend/${localPython}`) ? localPython : "python");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15_000,
    baseURL: "http://127.0.0.1:4191",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: `"${python}" -m tests.serve_e2e`, cwd: "../backend",
      url: "http://127.0.0.1:8011/api/health", reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: "node ./node_modules/vite/bin/vite.js --host=127.0.0.1 --port=4191 --strictPort",
      url: "http://127.0.0.1:4191", reuseExistingServer: false,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:8011/api", VITE_DATA_MODE: "api" },
    },
  ],
});
