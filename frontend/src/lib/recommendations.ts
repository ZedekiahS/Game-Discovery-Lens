import type { Game, GameCollection, PlayerGameRecord, PlayerPreferences, SavedGame } from "../types";
import { buildPlayerProfile } from "./playerProfile";

const compareCatalog = (left: Game, right: Game) =>
  right.rating - left.rating || right.reviewCount - left.reviewCount ||
  left.name.localeCompare(right.name, "en") || left.id - right.id;

// Shared cold-start order; sample metrics are not evidence of a player's interests.
export function recommendGames(catalog: readonly Game[]): Game[] {
  return [...catalog].sort(compareCatalog).slice(0, 6);
}

export interface RecommendationContext {
  records: readonly PlayerGameRecord[];
  collections: readonly GameCollection[];
  saved: Record<number, SavedGame[]>;
  preferences: PlayerPreferences;
}

export type RecommendationReason =
  | { kind: "preferred"; tags: string[] }
  | { kind: "interest" | "history"; tag: string; gameName: string }
  | { kind: "wishlist" | "explore" | "catalog" };

export interface RecommendationFeed {
  personalized: boolean;
  items: Array<{ game: Game; reasons: RecommendationReason[] }>;
}

/** Derive recommendations and their evidence together, without mutating or persisting a second profile. */
export function recommendForPlayer(catalog: readonly Game[], context?: RecommendationContext): RecommendationFeed {
  const general = (): RecommendationFeed => ({
    personalized: false,
    items: recommendGames(catalog).map((game) => ({ game, reasons: [{ kind: "catalog" }] })),
  });
  if (!context) return general();

  const { records, collections, saved, preferences } = context;
  const profile = buildPlayerProfile(catalog, records, collections, saved, preferences);
  const knownTags = new Set(catalog.flatMap((game) => game.tags));
  const preferred = new Set(preferences.preferredTags.filter((tag) => knownTags.has(tag)));
  const avoided = new Set(preferences.avoidedTags.filter((tag) => knownTags.has(tag)));
  const recordById = new Map(records.map((record) => [record.gameId, record]));
  const personalSaves = new Set(collections.filter((collection) => collection.purpose === "player")
    .flatMap((collection) => (saved[collection.id] ?? []).map((item) => item.gameId)));
  const hasHistory = catalog.some((game) => {
    const record = recordById.get(game.id);
    return personalSaves.has(game.id) || (record && (record.status !== null || record.affinity !== "neutral"));
  });
  if (!hasHistory && !preferred.size && !avoided.size) return general();

  // Broad tags provide weaker evidence than specific styles. Counts are capped so a large collection
  // cannot overwhelm an explicit choice. Played does not imply liked: its evidence stays distinct.
  const frequency = new Map<string, number>();
  for (const game of catalog) for (const tag of new Set(game.tags)) frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
  const evidenceFor = (game: Game, rows: typeof profile.interests) => rows
    .map((row) => ({ ...row, games: row.games.filter((source) => source.id !== game.id && recordById.get(source.id)?.affinity !== "dislike") }))
    .filter((row) => game.tags.includes(row.tag) && row.games.length > 0)
    .map((row) => ({ ...row, weight: Math.min(row.games.length, 3) / Math.sqrt(frequency.get(row.tag) ?? 1) }))
    .sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag, "en"));

  const candidates = catalog.flatMap((game) => {
    const record = recordById.get(game.id);
    if (game.tags.some((tag) => avoided.has(tag)) || record?.affinity === "dislike"
      || record?.status === "playing" || record?.status === "played") return [];
    const wishlist = record?.status === "want_to_play";
    // A wishlist entry can be surfaced again; other known favorites belong in the library.
    if (!wishlist && (record?.affinity === "like" || personalSaves.has(game.id))) return [];

    const preferredTags = [...new Set(game.tags.filter((tag) => preferred.has(tag)))].sort();
    const interests = evidenceFor(game, profile.interests);
    const history = evidenceFor(game, profile.played);
    const reasons: RecommendationReason[] = [];
    if (wishlist) reasons.push({ kind: "wishlist" });
    if (preferredTags.length) reasons.push({ kind: "preferred", tags: preferredTags.slice(0, 2) });
    const strongest = interests[0] ?? history[0];
    if (strongest) {
      const source = [...strongest.games].sort((a, b) => a.id - b.id)[0];
      reasons.push({ kind: interests.length ? "interest" : "history", tag: strongest.tag, gameName: source.name });
    }
    if (!reasons.length) reasons.push({ kind: "explore" });

    return [{ game, reasons: reasons.slice(0, 2),
      tier: wishlist ? 3 : preferredTags.length ? 2 : strongest ? 1 : 0,
      score: preferredTags.length * 6 + interests.reduce((sum, row) => sum + row.weight * 2, 0)
        + history.reduce((sum, row) => sum + row.weight, 0),
    }];
  });

  const items: RecommendationFeed["items"] = [];
  const usedTags = new Map<string, number>();
  const adjustedScore = (candidate: typeof candidates[number]) => candidate.score
    - [...new Set(candidate.game.tags)].reduce((sum, tag) => sum + (usedTags.get(tag) ?? 0) * 0.35, 0);
  while (candidates.length && items.length < 6) {
    // Variety only breaks competition within the same evidence tier; explicit choices remain first.
    candidates.sort((a, b) => b.tier - a.tier || adjustedScore(b) - adjustedScore(a) || compareCatalog(a.game, b.game));
    const next = candidates.shift()!;
    items.push({ game: next.game, reasons: next.reasons });
    for (const tag of new Set(next.game.tags)) usedTags.set(tag, (usedTags.get(tag) ?? 0) + 1);
  }
  return { personalized: true, items };
}
