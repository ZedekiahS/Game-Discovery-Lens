import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../src/data/games";
import { useCollections } from "../src/hooks/useCollections";
import * as catalog from "../src/services/catalog";
import type { GameCollection, SavedGame, ShortlistInsights } from "../src/types";

vi.mock("../src/services/catalog", () => ({
  getCollections: vi.fn(), getSavedGames: vi.fn(), getShortlistInsights: vi.fn(),
  saveGame: vi.fn(), removeSavedGame: vi.fn(), clearSavedGames: vi.fn(),
  createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

const collectionA: GameCollection = {
  id: 11, userId: "account-a", name: "A shortlist", description: "", createdAt: "2026-01-01T00:00:00Z",
};
const collectionB: GameCollection = { ...collectionA, id: 21, userId: "account-b", name: "B shortlist" };
const savedA: SavedGame = {
  id: 101, userId: collectionA.userId, collectionId: collectionA.id,
  gameId: games[0].id, game: games[0], createdAt: "2026-01-01T00:00:00Z",
};
const savedB: SavedGame = { ...savedA, id: 201, userId: collectionB.userId, collectionId: collectionB.id };

function insights(userId: string): ShortlistInsights {
  return {
    userId, savedCount: 0, averagePrice: 0, averageRating: 0, totalVisibleRevenue: 0, topTags: [],
    strategy: { title: userId, caption: "", body: `${userId} suggestions`, bullets: [] }, source: "rules",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(catalog.getCollections).mockImplementation(async (userId) => [
    userId === collectionA.userId ? collectionA : collectionB,
  ]);
  vi.mocked(catalog.getSavedGames).mockResolvedValue([]);
  vi.mocked(catalog.getShortlistInsights).mockImplementation(async (_saved, userId) => insights(userId));
});

afterEach(() => cleanup());

describe("collection persistence and request ownership", () => {
  it("loads all folders in one read and skips insights while the panel is hidden", async () => {
    const other = { ...collectionA, id: 12, name: "Another list" };
    vi.mocked(catalog.getCollections).mockResolvedValue([collectionA, other]);
    vi.mocked(catalog.getSavedGames).mockResolvedValue([savedA, { ...savedA, id: 102, collectionId: 12 }]);
    const { result, rerender } = renderHook(({ visible }) => useCollections(games, collectionA.userId, 0, "player", visible), { initialProps: { visible: false } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(catalog.getSavedGames).toHaveBeenCalledTimes(1);
    expect(catalog.getSavedGames).toHaveBeenCalledWith(games, collectionA.userId, "all");
    expect(result.current.savedGamesByCollection[12]).toHaveLength(1);
    expect(catalog.getShortlistInsights).not.toHaveBeenCalled();
    rerender({ visible: true });
    await waitFor(() => expect(catalog.getShortlistInsights).toHaveBeenCalledTimes(1));
  });
  it("restores saved games returned by the account API on a fresh mount", async () => {
    vi.mocked(catalog.getSavedGames).mockResolvedValue([savedA]);
    const { result } = renderHook(() => useCollections(games, collectionA.userId));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.collections).toEqual([collectionA]);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([savedA]);
    expect(result.current.error).toBe("");
  });

  it("blocks more writes after an uncertain save until a successful reload", async () => {
    vi.mocked(catalog.saveGame)
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce(savedA);
    const { result } = renderHook(() => useCollections(games, collectionA.userId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved!: boolean;
    await act(async () => { saved = await result.current.save(games[0], collectionA); });
    expect(saved).toBe(false);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([]);
    expect(result.current.error).toContain("Storage unavailable");
    expect(result.current.busy).toBe(false);

    await act(async () => { saved = await result.current.save(games[0], collectionA); });
    expect(saved).toBe(false);
    expect(catalog.saveGame).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.clear(collectionA.id); await result.current.create("Duplicate"); });
    expect(catalog.clearSavedGames).not.toHaveBeenCalled();
    expect(catalog.createCollection).not.toHaveBeenCalled();
    vi.mocked(catalog.getCollections).mockRejectedValueOnce(new Error("Still offline"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe("Still offline"));
    await act(async () => { saved = await result.current.save(games[0], collectionA); });
    expect(saved).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(""));
    await act(async () => { saved = await result.current.save(games[0], collectionA); });
    expect(saved).toBe(true);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([savedA]);
    expect(result.current.error).toBe("");
  });

  it("waits for save acknowledgement and blocks duplicate clicks in the same event", async () => {
    const request = deferred<SavedGame>();
    vi.mocked(catalog.saveGame).mockReturnValue(request.promise);
    const { result } = renderHook(() => useCollections(games, collectionA.userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;

    act(() => {
      first = result.current.save(games[0], collectionA);
      second = result.current.save(games[0], collectionA);
    });
    expect(catalog.saveGame).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);
    expect(result.current.busy).toBe(true);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([]);

    await act(async () => { request.resolve(savedA); await first; });
    expect(await first).toBe(true);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([savedA]);
  });

  it("discards an old account's collection response after switching accounts", async () => {
    const request = deferred<GameCollection[]>();
    vi.mocked(catalog.getCollections).mockImplementation((userId) => userId === collectionA.userId
      ? request.promise : Promise.resolve([collectionB]));
    vi.mocked(catalog.getSavedGames).mockResolvedValue([savedB]);
    const { result, rerender } = renderHook(({ userId }) => useCollections(games, userId), {
      initialProps: { userId: collectionA.userId },
    });

    rerender({ userId: collectionB.userId });
    await waitFor(() => expect(result.current.collections).toEqual([collectionB]));
    await act(async () => request.resolve([collectionA]));

    expect(result.current.collections).toEqual([collectionB]);
    expect(result.current.savedGamesByCollection[collectionB.id]).toEqual([savedB]);
    expect(result.current.savedGamesByCollection[collectionA.id]).toBeUndefined();
  });

  it("does not apply an old account's completed save to the new account", async () => {
    const request = deferred<SavedGame>();
    vi.mocked(catalog.saveGame).mockReturnValue(request.promise);
    const { result, rerender } = renderHook(({ userId }) => useCollections(games, userId), {
      initialProps: { userId: collectionA.userId },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let save!: Promise<boolean>;
    act(() => { save = result.current.save(games[0], collectionA); });

    rerender({ userId: collectionB.userId });
    await waitFor(() => expect(result.current.collections).toEqual([collectionB]));
    await act(async () => { request.resolve(savedA); await save; });

    expect(await save).toBe(false);
    expect(result.current.collections).toEqual([collectionB]);
    expect(result.current.savedGamesByCollection[collectionB.id]).toEqual([]);
    expect(result.current.savedGamesByCollection[collectionA.id]).toBeUndefined();
    expect(result.current.error).toBe("");
  });

  it("drops pending results when the session changes even for the same account", async () => {
    const request = deferred<SavedGame>();
    vi.mocked(catalog.saveGame).mockReturnValue(request.promise);
    const { result, rerender } = renderHook(({ revision }) => useCollections(games, collectionA.userId, revision), {
      initialProps: { revision: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let save!: Promise<boolean>;
    act(() => { save = result.current.save(games[0], collectionA); });

    rerender({ revision: 2 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { request.resolve(savedA); await save; });

    expect(await save).toBe(false);
    expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([]);
  });

  it("keeps the new account's AI insights when an older insight request arrives late", async () => {
    const request = deferred<ShortlistInsights>();
    vi.mocked(catalog.getShortlistInsights).mockImplementation((_saved, userId) => userId === collectionA.userId
      ? request.promise : Promise.resolve(insights(userId)));
    const { result, rerender } = renderHook(({ userId }) => useCollections(games, userId), {
      initialProps: { userId: collectionA.userId },
    });
    await waitFor(() => expect(catalog.getShortlistInsights).toHaveBeenCalled());

    rerender({ userId: collectionB.userId });
    await waitFor(() => expect(result.current.shortlistInsights?.userId).toBe(collectionB.userId));
    await act(async () => request.resolve(insights(collectionA.userId)));

    expect(result.current.shortlistInsights?.userId).toBe(collectionB.userId);
    expect(result.current.shortlistInsights?.strategy.body).toBe("account-b suggestions");
  });

  it("clears private collections immediately when the account is removed", async () => {
    vi.mocked(catalog.getSavedGames).mockResolvedValue([savedA]);
    const { result, rerender } = renderHook(({ userId }: { userId: string | null }) => useCollections(games, userId), {
      initialProps: { userId: collectionA.userId as string | null },
    });
    await waitFor(() => expect(result.current.savedGamesByCollection[collectionA.id]).toEqual([savedA]));

    rerender({ userId: null });
    expect(result.current.collections).toEqual([]);
    expect(result.current.savedGamesByCollection).toEqual({});
    expect(result.current.shortlistInsights).toBeNull();
  });

  it("keeps a successfully created collection when its following save fails", async () => {
    const created: GameCollection = { ...collectionA, id: 12, name: "New collection" };
    vi.mocked(catalog.createCollection).mockResolvedValue(created);
    vi.mocked(catalog.saveGame).mockRejectedValue(new Error("Save unavailable"));
    const { result } = renderHook(() => useCollections(games, collectionA.userId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let saved!: boolean;

    await act(async () => { saved = await result.current.createAndSave(created.name, games[0]); });

    expect(saved).toBe(false);
    expect(result.current.collections).toContainEqual(created);
    expect(result.current.savedGamesByCollection[created.id] ?? []).toEqual([]);
    expect(result.current.error).toContain("Save unavailable");
  });

  it("does not start the save step if the account changes while creating its collection", async () => {
    const request = deferred<GameCollection>();
    vi.mocked(catalog.createCollection).mockReturnValue(request.promise);
    const { result, rerender } = renderHook(({ userId }) => useCollections(games, userId), {
      initialProps: { userId: collectionA.userId },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let save!: Promise<boolean>;
    act(() => { save = result.current.createAndSave("New collection", games[0]); });

    rerender({ userId: collectionB.userId });
    await waitFor(() => expect(result.current.collections).toEqual([collectionB]));
    await act(async () => { request.resolve({ ...collectionA, id: 12 }); await save; });

    expect(await save).toBe(false);
    expect(catalog.saveGame).not.toHaveBeenCalled();
    expect(result.current.collections).toEqual([collectionB]);
  });
});
