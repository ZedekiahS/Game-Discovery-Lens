import type { Game, GameCollection, PlayerGameRecord, PlayerPreferences, SavedGame } from "../types";

export function buildPlayerProfile(catalog: readonly Game[], records: readonly PlayerGameRecord[], collections: readonly GameCollection[], saved: Record<number, SavedGame[]>, preferences: PlayerPreferences) {
  const games = new Map(catalog.map((g) => [g.id, g]));
  const uniqueRecords = new Map(records.map((r) => [r.gameId, r]));
  const liked = new Set(records.filter((r) => r.affinity === "like").map((r) => r.gameId));
  const collected = new Set(collections.filter((c) => c.purpose === "player")
    .flatMap((c) => (saved[c.id] ?? []).map((r) => r.gameId)));
  const interests = new Set([...liked, ...collected].filter((id) => uniqueRecords.get(id)?.affinity !== "dislike"));
  const played = new Set(records.filter((r) => r.status === "playing" || r.status === "played").map((r) => r.gameId));
  const distribution = (ids: Set<number>, avoid: string[] = []) => {
    const byTag = new Map<string, Game[]>();
    for (const id of ids) {
      const game = games.get(id);
      if (!game) continue;
      for (const tag of new Set(game.tags)) {
        if (avoid.includes(tag)) continue;
        byTag.set(tag, [...(byTag.get(tag) ?? []), game]);
      }
    }
    return [...byTag].map(([tag, evidence]) => ({ tag, games: evidence }))
      .sort((a, b) => b.games.length - a.games.length || a.tag.localeCompare(b.tag));
  };
  return {
    interests: distribution(interests, preferences.avoidedTags), played: distribution(played),
    interestCount: [...interests].filter((id) => games.has(id)).length,
    playedCount: [...played].filter((id) => games.has(id)).length,
    representatives: [...liked].filter((id) => interests.has(id)).map((id) => games.get(id)).filter((g): g is Game => !!g),
  };
}
