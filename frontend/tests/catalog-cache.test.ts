import { verifiedAccount } from "./session-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../src/data/games";

beforeEach(() => { vi.resetModules(); vi.stubEnv("VITE_DATA_MODE", "api"); window.history.replaceState(null, "", "/"); window.localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("public game request reuse", () => {
  it("shares pending and recent reads, expires them, and supports explicit refresh", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(games[0])));
    vi.stubGlobal("fetch", fetch);
    const { apiCatalog } = await import("../src/services/catalog/api");
    await Promise.all([apiCatalog.getGameDetail(1, games), apiCatalog.getGameDetail(1, games)]);
    await apiCatalog.getGameDetail(1, games);
    expect(fetch).toHaveBeenCalledTimes(1);
    await apiCatalog.getGameDetail(1, games, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    now += 60_001;
    await apiCatalog.getGameDetail(1, games);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not cache failures, clears public data on catalog reload, and never caches account reads", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"detail":"Unavailable"}', { status: 503 }))
      .mockImplementation(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    const { apiCatalog } = await import("../src/services/catalog/api");
    const { setStoredAuthToken } = await import("../src/services/users");
    await expect(apiCatalog.getGameInsights(games[0])).rejects.toMatchObject({ status: 503 });
    await apiCatalog.getGameInsights(games[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    await apiCatalog.getCatalog();
    await apiCatalog.getGameInsights(games[0]);
    expect(fetch).toHaveBeenCalledTimes(4);
    await verifiedAccount("first", "first");
    await apiCatalog.getSavedGames(games, "first", "all");
    await verifiedAccount("second", "second");
    await apiCatalog.getSavedGames(games, "second", "all");
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls[5][1].headers.Authorization).toBe("Bearer second");
    expect(fetch.mock.calls[5][0]).toMatch(/allCollections=true$/);
  });
});
