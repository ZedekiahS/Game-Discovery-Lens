import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../src/data/games";

const userId = "guest-storage-test";
const collectionKey = `game-discovery-lens.demo.collections.${userId}`;
const savedKey = `game-discovery-lens.demo.savedCollectionGameIds.${userId}`;
const collection = { id: 2, userId, name: "Keep", description: "", createdAt: "2026-01-01" };
const failures = ["blocked", "malformed"] as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_DATA_MODE", "demo");
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeUnreadable(key: string, failure: typeof failures[number], stored: string) {
  const raw = failure === "malformed" ? "{damaged json" : stored;
  window.localStorage.setItem(key, raw);
  const originalGetItem = Storage.prototype.getItem;
  if (failure === "blocked") {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, requestedKey) {
      if (requestedKey === key) throw new Error("Browser storage read blocked");
      return originalGetItem.call(this, requestedKey);
    });
  }
  return () => expect(originalGetItem.call(window.localStorage, key)).toBe(raw);
}

async function outcome(operation: () => Promise<unknown>) {
  return operation().then(() => "fulfilled", () => "rejected");
}

describe("unreadable demo storage", () => {
  it.each(failures)("rejects collection reads and creation when storage is %s without replacing it", async (failure) => {
    const catalog = await import("../src/services/catalog");
    const assertUnchanged = makeUnreadable(collectionKey, failure, JSON.stringify([collection]));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const read = await outcome(() => catalog.getCollections(userId));
    const write = await outcome(() => catalog.createCollection("New", userId));

    expect({ read, write }).toEqual({ read: "rejected", write: "rejected" });
    expect(setItem).not.toHaveBeenCalled();
    assertUnchanged();
  });

  it.each(failures)("rejects saved-game reads, saves, and clearing when storage is %s", async (failure) => {
    const catalog = await import("../src/services/catalog");
    const assertUnchanged = makeUnreadable(savedKey, failure, JSON.stringify({ 1: [games[0].id], 2: [games[1].id] }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const read = await outcome(() => catalog.getSavedGames(games, userId));
    const save = await outcome(() => catalog.saveGame(games[2], games, userId));
    const clear = await outcome(() => catalog.clearSavedGames(userId));

    expect({ read, save, clear }).toEqual({ read: "rejected", save: "rejected", clear: "rejected" });
    expect(setItem).not.toHaveBeenCalled();
    assertUnchanged();
  });

  it.each(failures)("does not partially delete a collection when its saved-game storage is %s", async (failure) => {
    const catalog = await import("../src/services/catalog");
    const originalCollections = JSON.stringify([collection]);
    window.localStorage.setItem(collectionKey, originalCollections);
    const assertUnchanged = makeUnreadable(savedKey, failure, JSON.stringify({ 2: [games[0].id] }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await expect(catalog.deleteCollection(collection.id, userId)).rejects.toThrow();

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(collectionKey)).toBe(originalCollections);
    assertUnchanged();
  });
});


describe("personal defaults without reclassifying old collections", () => {
  it("persists the personal purpose across the first save and reload", async () => {
    const catalog = await import("../src/services/catalog");
    expect((await catalog.getCollections(userId))[0].purpose).toBe("player");
    await catalog.saveGame(games[0], games, userId, 1);
    vi.resetModules();
    const reloaded = await import("../src/services/catalog");
    expect((await reloaded.getCollections(userId))[0].purpose).toBe("player");
    expect(await reloaded.getSavedGames(games, userId, 1)).toHaveLength(1);
  });
  it.each(["game-discovery-lens", "arcadeiq"])("leaves %s saved-game-only history unclassified", async (brand) => {
    window.localStorage.setItem(`${brand}.demo.savedCollectionGameIds.${userId}`, JSON.stringify({ 1: [games[0].id] }));
    const catalog = await import("../src/services/catalog");
    expect((await catalog.getCollections(userId))[0].purpose).toBeUndefined();
    expect(await catalog.getSavedGames(games, userId, 1)).toHaveLength(1);
  });
  it("does not overwrite a stored research or unclassified default", async () => {
    const catalog = await import("../src/services/catalog");
    for (const purpose of [undefined, "research"]) {
      window.localStorage.setItem(collectionKey, JSON.stringify([{ ...collection, id: 1, name: "Default Shortlist", purpose }]));
      expect((await catalog.getCollections(userId))[0].purpose).toBe(purpose);
    }
  });
});
