import type { Game, PlayerGameRecord, SavedGame } from "../types";

export type LibrarySort = "updated" | "collected" | "name";
export const createLibraryView = () => ({
  query: "", shelf: "all", collectionFilter: "", adding: false, sort: "updated" as LibrarySort,
});
export type LibraryViewMemory = { view: ReturnType<typeof createLibraryView>; scrollY: number; gameId: number | null };
export const createLibraryMemory = (): LibraryViewMemory => ({ view: createLibraryView(), scrollY: 0, gameId: null });

export function sortLibraryGames(games: Game[], sort: LibrarySort, records: PlayerGameRecord[], saves: SavedGame[]) {
  const collected = new Map<number, number>();
  const timestamp = (value: string) => Date.parse(value) || 0;
  for (const save of saves) collected.set(save.gameId, Math.max(collected.get(save.gameId) ?? 0, timestamp(save.createdAt)));
  const updated = new Map(collected);
  for (const record of records) updated.set(record.gameId, Math.max(updated.get(record.gameId) ?? 0, timestamp(record.updatedAt)));
  const dates = sort === "collected" ? collected : updated;
  return [...games].sort((a, b) => (sort === "name" ? 0 : (dates.get(b.id) ?? 0) - (dates.get(a.id) ?? 0))
    || a.name.localeCompare(b.name, "en") || a.id - b.id);
}
