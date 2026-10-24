import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    clearMocks: true,
    // JSDOM journeys are CPU-heavy; bound concurrency rather than relaxing assertions/timeouts.
    maxWorkers: 2,
  },
}));
