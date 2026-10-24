import { verifiedAccount } from "./session-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../src/data/games";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_DATA_MODE", "api");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000/api");
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticatedCatalog() {
  const users = await import("../src/services/users");
  await verifiedAccount();
  return import("../src/services/catalog");
}

describe("API collection contract", () => {
  it.each([401, 403, 409, 500])("preserves HTTP %s and leaves browser saves untouched", async (status) => {
    const catalog = await authenticatedCatalog();
    const { ApiError } = await import("../src/services/http");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Write rejected" }, status)));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const promise = catalog.saveGame(games[0], games, "account-a");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status, message: "Write rejected" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not turn other failed collection writes into local success", async () => {
    const catalog = await authenticatedCatalog();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({}, 503))));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const operations = [
      () => catalog.createCollection("New", "account-a"),
      () => catalog.updateCollection(2, "Renamed", "account-a"),
      () => catalog.deleteCollection(2, "account-a"),
      () => catalog.removeSavedGame(games[0].id, "account-a"),
      () => catalog.clearSavedGames("account-a"),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({ status: 503 });
    }
    expect(setItem).not.toHaveBeenCalled();
  });

  it("uses the token for ownership, never a caller-selected user ID", async () => {
    const catalog = await authenticatedCatalog();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(catalog.getCollections("another-account")).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
    await catalog.getCollections("account-a");
    await catalog.getSavedGames(games, "account-a", 7);
    await catalog.saveGame(games[0], games, "account-a", 7);
    await catalog.createCollection("Wishlist", "account-a");
    await catalog.updateCollection(7, "Later", "account-a");
    await catalog.removeSavedGame(games[0].id, "account-a", 7);
    await catalog.clearSavedGames("account-a", 7);
    await catalog.deleteCollection(7, "account-a");

    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(url).not.toContain("userId");
      expect(init.headers).toMatchObject({ Authorization: "Bearer account-a-token" });
      expect(init.body ?? "").not.toContain("userId");
      expect(init.body ?? "").not.toContain("another-account");
    }
    expect(fetchMock.mock.calls[1][0]).toContain("collectionId=7");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ gameId: games[0].id, collectionId: 7 });
  });

  it("rejects anonymous private requests before contacting the API", async () => {
    const catalog = await import("../src/services/catalog");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(catalog.getCollections("guessed-user")).rejects.toMatchObject({ status: 401 });
    await expect(catalog.saveGame(games[0], games, "guessed-user")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports network failure without loading samples or forgetting the token", async () => {
    const catalog = await authenticatedCatalog();
    const { getStoredAuthToken } = await import("../src/services/users");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(catalog.getCatalog()).rejects.toMatchObject({ status: 0 });
    await expect(catalog.getCollections("account-a")).rejects.toMatchObject({ status: 0 });
    await expect(catalog.getSavedGames(games, "account-a")).rejects.toMatchObject({ status: 0 });
    await expect(catalog.getGameDetail(games[0].id, games)).rejects.toMatchObject({ status: 0 });
    await expect(catalog.searchCatalog("cozy", [], games)).rejects.toMatchObject({ status: 0 });
    await expect(catalog.getGameInsights(games[0])).rejects.toMatchObject({ status: 0 });
    await expect(catalog.getShortlistInsights([], "account-a")).rejects.toMatchObject({ status: 0 });
    expect(getStoredAuthToken()).toBe("account-a-token");
  });

  it("keeps AI provider results and backend rule fallback sources unchanged", async () => {
    const catalog = await authenticatedCatalog();
    const searchResult = { source: "deepseek", games: [games[0]], intent: { tags: ["Action"] } };
    const detailResult = { source: "rules", gameId: games[0].id, reviewIntelligence: { body: "Backend rules" } };
    const shortlistResult = { source: "deepseek", userId: "account-a", savedCount: 1, strategy: { body: "AI collection summary" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(searchResult))
      .mockResolvedValueOnce(jsonResponse(detailResult))
      .mockResolvedValueOnce(jsonResponse(shortlistResult));
    vi.stubGlobal("fetch", fetchMock);

    await expect(catalog.searchCatalog("action under $20", [], games)).resolves.toEqual(searchResult);
    await expect(catalog.getGameInsights(games[0])).resolves.toEqual(detailResult);
    // Even a currently empty view must consult the server in API mode.
    await expect(catalog.getShortlistInsights([], "account-a", 7)).resolves.toEqual(shortlistResult);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("explicit demo mode", () => {
  it("uses samples and local persistence without any network request", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const catalog = await import("../src/services/catalog");
    const users = await import("../src/services/users");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(catalog.getCatalog()).resolves.toEqual(games);
    const collection = await catalog.createCollection("Demo wishlist", "guest-a");
    await catalog.saveGame(games[0], games, "guest-a", collection.id);
    await expect(catalog.getSavedGames(games, "guest-a", collection.id)).resolves.toMatchObject([{ gameId: games[0].id }]);
    await expect(catalog.getSavedGames(games, "guest-b", collection.id)).resolves.toEqual([]);
    await catalog.updateCollection(collection.id, "Later", "guest-a");
    await expect(catalog.getCollections("guest-a")).resolves.toMatchObject([{ id: 1 }, { name: "Later" }]);
    await catalog.getGameDetail(games[0].id, games);
    await expect(catalog.searchCatalog("cozy", [], games)).resolves.toMatchObject({ source: "mock" });
    await expect(catalog.getGameInsights(games[0])).resolves.toMatchObject({ source: "mock" });
    await catalog.getShortlistInsights(await catalog.getSavedGames(games, "guest-a", collection.id), "guest-a", collection.id);

    vi.resetModules();
    const reloaded = await import("../src/services/catalog");
    await expect(reloaded.getSavedGames(games, "guest-a", collection.id)).resolves.toMatchObject([{ gameId: games[0].id }]);
    await reloaded.removeSavedGame(games[0].id, "guest-a", collection.id);
    await reloaded.clearSavedGames("guest-a", collection.id);
    await reloaded.deleteCollection(collection.id, "guest-a");
    await expect(users.loginUser("account-a", "password")).rejects.toThrow();
    await expect(users.registerUser("a@example.test", "Account A", "password")).rejects.toThrow();
    await expect(users.getAuthenticatedUser("token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not adopt or delete pre-existing browser saves", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    window.localStorage.setItem("arcadeiq.savedGameIds", JSON.stringify([games[0].id]));
    window.localStorage.setItem("arcadeiq.savedCollectionGameIds.demo-user", JSON.stringify({ 1: [games[0].id] }));
    window.localStorage.setItem("arcadeiq.collections.demo-user", JSON.stringify([{ id: 99, userId: "demo-user", name: "Old", description: "", createdAt: "2026-01-01" }]));
    const catalog = await import("../src/services/catalog");

    await expect(catalog.getSavedGames(games, "demo-user")).resolves.toEqual([]);
    await expect(catalog.getCollections("demo-user")).resolves.toHaveLength(1);
    await catalog.saveGame(games[1], games, "demo-user");
    await catalog.clearSavedGames("demo-user");
    expect(window.localStorage.getItem("arcadeiq.savedGameIds")).toBe(JSON.stringify([games[0].id]));
    expect(window.localStorage.getItem("arcadeiq.savedCollectionGameIds.demo-user")).toBe(JSON.stringify({ 1: [games[0].id] }));
  });

  it("keeps collections and saves from the previous brand storage keys", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const legacyCollection = { id: 2, userId: "demo-user", name: "Keep", description: "", createdAt: "2026-01-01" };
    window.localStorage.setItem("arcadeiq.demo.collections.demo-user", JSON.stringify([legacyCollection]));
    window.localStorage.setItem("arcadeiq.demo.savedCollectionGameIds.demo-user", JSON.stringify({ 2: [games[0].id] }));
    const catalog = await import("../src/services/catalog");

    await expect(catalog.getCollections("demo-user")).resolves.toContainEqual(legacyCollection);
    await expect(catalog.getSavedGames(games, "demo-user", 2)).resolves.toMatchObject([{ gameId: games[0].id }]);
  });

  it("uses the explicit URL mode over the environment and does not change mid-page", async () => {
    window.history.replaceState({}, "", "/?mode=demo");
    const runtime = await import("../src/services/runtime");
    expect(runtime.DATA_MODE).toBe("demo");
    window.history.replaceState({}, "", "/?mode=api");
    expect(runtime.DATA_MODE).toBe("demo");
    vi.resetModules();
    expect((await import("../src/services/runtime")).DATA_MODE).toBe("api");
  });
});

describe("authentication persistence", () => {
  it("leaves token ownership to the caller after login and registration", async () => {
    const users = await import("../src/services/users");
    const session = { accessToken: "late-token", tokenType: "bearer", expiresIn: 3600, user: { id: "account-a" } };
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(session))));

    await expect(users.loginUser("account-a", "password")).resolves.toEqual(session);
    await expect(users.registerUser("a@example.test", "Account A", "password")).resolves.toEqual(session);
    expect(users.getStoredAuthToken()).toBeNull();
  });

  it("retains an existing token when account restoration has a network error", async () => {
    const users = await import("../src/services/users");
    users.setStoredAuthToken("current-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Offline")));

    await expect(users.getAuthenticatedUser("current-token")).rejects.toMatchObject({ status: 0 });
    expect(users.getStoredAuthToken()).toBe("current-token");
  });

  it("separates API tokens by backend and ignores the old shared key", async () => {
    window.localStorage.setItem("arcadeiq.authToken", "legacy-token");
    const firstBackend = await import("../src/services/users");
    expect(firstBackend.getStoredAuthToken()).toBeNull();
    firstBackend.setStoredAuthToken("first-backend-token");

    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8001/api");
    vi.resetModules();
    const secondBackend = await import("../src/services/users");
    expect(secondBackend.getStoredAuthToken()).toBeNull();
    secondBackend.setStoredAuthToken("second-backend-token");
    secondBackend.clearStoredAuthToken();
    expect(firstBackend.getStoredAuthToken()).toBe("first-backend-token");
    expect(window.localStorage.getItem("arcadeiq.authToken")).toBe("legacy-token");
  });

  it("moves a backend-scoped token from the previous brand key", async () => {
    window.localStorage.setItem("arcadeiq.api.http%3A%2F%2Flocalhost%3A8000%2Fapi.authToken", "legacy-token");
    const users = await import("../src/services/users");

    expect(users.getStoredAuthToken()).toBe("legacy-token");
    expect(window.localStorage.getItem("game-discovery-lens.api.http%3A%2F%2Flocalhost%3A8000%2Fapi.authToken")).toBe("legacy-token");
  });
});
