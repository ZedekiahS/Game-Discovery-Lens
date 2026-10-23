import { afterEach, expect, it, vi } from "vitest";
import { games } from "../src/data/games";
import { sortLibraryGames } from "../src/lib/libraryView";
import { demoCatalog } from "../src/services/catalog/demo";
import type { PlayerGameRecord, SavedGame } from "../src/types";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });
it("sorts by real activity dates, keeps duplicate memberships, and puts unknown dates last", () => {
  const sample = [games[0], games[1], games[2]];
  const saves = [{ gameId: sample[0].id, createdAt: "2026-01-01" }, { gameId: sample[0].id, createdAt: "2026-03-01" },
    { gameId: sample[1].id, createdAt: "2026-02-01" }, { gameId: sample[2].id, createdAt: "" }] as SavedGame[];
  const records = [{ gameId: sample[1].id, updatedAt: "2026-04-01" }] as PlayerGameRecord[];
  expect(sortLibraryGames(sample, "collected", records, saves).map(g => g.id)).toEqual(sample.map(g => g.id));
  expect(sortLibraryGames(sample, "updated", records, saves).map(g => g.id)).toEqual([sample[1].id, sample[0].id, sample[2].id]);
  expect(sortLibraryGames(sample, "name", records, saves).map(g => g.name)).toEqual(sample.map(g => g.name).sort((a, b) => a.localeCompare(b, "en")));
  expect(sample[0]).toBe(games[0]);
});
it("retains collection dates across reload and duplicate save without inventing legacy timestamps", async () => {
  const id = "date-test";
  window.localStorage.setItem(`game-discovery-lens.demo.savedCollectionGameIds.${id}`, JSON.stringify({ 1: [games[0].id] }));
  const first = await demoCatalog.saveGame(games[1], games, id);
  const duplicate = await demoCatalog.saveGame(games[1], games, id);
  const saved = await demoCatalog.getSavedGames(games, id, "all");
  expect(first.createdAt).not.toBe("");
  expect(duplicate.createdAt).toBe(first.createdAt);
  expect(saved.find(g => g.gameId === games[1].id)?.createdAt).toBe(first.createdAt);
  expect(saved.find(g => g.gameId === games[0].id)?.createdAt).toBe("");
});
