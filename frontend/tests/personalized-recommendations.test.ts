import { describe, expect, it } from "vitest";
import { recommendForPlayer, recommendGames, type RecommendationContext } from "../src/lib/recommendations";
import type { Game, GameCollection, PlayerGameRecord, SavedGame } from "../src/types";

const game = (id: number, tags: string[], rating = 4): Game => ({ id, name: `Game ${id}`, tags, rating,
  reviewCount: 50, price: 10, releaseYear: 2024, developer: "Studio", publisher: "Studio", summary: "", ownership: 0, revenue: 0 });
const record = (gameId: number, status: PlayerGameRecord["status"], affinity: PlayerGameRecord["affinity"] = "neutral"): PlayerGameRecord => ({ gameId, status, affinity, notes: "", updatedAt: "" });
const empty = (): RecommendationContext => ({ records: [], collections: [], saved: {}, preferences: { preferredTags: [], avoidedTags: [] } });
const ids = (feed: ReturnType<typeof recommendForPlayer>) => feed.items.map((item) => item.game.id);

describe("personal recommendations", () => {
  it("retains the cold-start order for empty, note-only, research and unclassified profiles", () => {
    const catalog = [game(1, ["FPS"], 5), game(2, ["Puzzle"], 3)];
    const context = empty();
    context.records = [record(1, null)];
    context.collections = [{ id: 1, purpose: "research" }, { id: 2 }] as GameCollection[];
    context.saved = { 1: [{ gameId: 2 }], 2: [{ gameId: 1 }] } as Record<number, SavedGame[]>;
    expect(recommendForPlayer(catalog, context).personalized).toBe(false);
    expect(ids(recommendForPlayer(catalog, context))).toEqual(recommendGames(catalog).map((g) => g.id));
    expect(recommendForPlayer([], empty()).items).toEqual([]);
  });

  it("puts explicit preferences before inferred interests and popularity", () => {
    const catalog = [game(1, ["FPS"], 5), game(2, ["Puzzle"], 2), game(3, ["FPS"], 5)];
    const context = { ...empty(), records: [record(3, "played", "like")], preferences: { preferredTags: ["Puzzle"], avoidedTags: [] } };
    const result = recommendForPlayer(catalog, context);
    expect(ids(result)).toEqual([2, 1]);
    expect(result.items[0].reasons[0]).toEqual({ kind: "preferred", tags: ["Puzzle"] });
    expect(result.items[1].reasons[0]).toEqual({ kind: "interest", tag: "FPS", gameName: "Game 3" });
  });

  it("never fills slots with avoided, disliked, playing, played or already-liked games", () => {
    const catalog = [game(1, ["Puzzle", "Horror"]), ...[2, 3, 4, 5, 6].map((id) => game(id, ["Puzzle"]))];
    const context = { ...empty(), records: [record(1, "want_to_play"), record(2, null, "dislike"), record(3, "playing"), record(4, "played"), record(5, null, "like")], preferences: { preferredTags: ["Puzzle"], avoidedTags: ["Horror"] } };
    expect(ids(recommendForPlayer(catalog, context))).toEqual([6]);
    context.preferences.avoidedTags = ["Puzzle"];
    expect(recommendForPlayer(catalog, context)).toEqual({ personalized: true, items: [] });
  });

  it("can resurface a liked wishlist game without using it as its own evidence", () => {
    const context = { ...empty(), records: [record(1, "want_to_play", "like")] };
    const result = recommendForPlayer([game(1, ["Puzzle"]), game(2, ["FPS"], 5)], context);
    expect(ids(result)[0]).toBe(1);
    expect(result.items[0].reasons).toEqual([{ kind: "wishlist" }]);
    expect(result.items[1].reasons).toEqual([{ kind: "explore" }]);
  });

  it("deduplicates personal collection evidence and ignores research for both ranking and reasons", () => {
    const catalog = [game(1, ["Puzzle"]), game(2, ["FPS"]), game(3, ["Puzzle"], 3), game(4, ["FPS"], 5)];
    const context = empty();
    context.collections = [{ id: 1, purpose: "player" }, { id: 2, purpose: "player" }, { id: 3, purpose: "research" }] as GameCollection[];
    context.saved = { 1: [{ gameId: 1 }], 2: [{ gameId: 1 }], 3: [{ gameId: 2 }] } as Record<number, SavedGame[]>;
    const result = recommendForPlayer(catalog, context);
    expect(ids(result)[0]).toBe(3);
    expect(ids(result)).not.toContain(1);
    expect(result.items[0].reasons[0]).toEqual({ kind: "interest", tag: "Puzzle", gameName: "Game 1" });
    expect(result.items.flatMap((item) => item.reasons).some((r) => "gameName" in r && r.gameName === "Game 2")).toBe(false);
    context.collections = context.collections.filter((c) => c.id !== 2);
    expect(recommendForPlayer(catalog, context)).toEqual(result);
  });

  it("labels play-history evidence without calling it a like, and excludes disliked history from evidence", () => {
    const context = { ...empty(), records: [record(1, "played"), record(3, "played", "dislike")] };
    const result = recommendForPlayer([game(1, ["Puzzle"]), game(2, ["Puzzle"]), game(3, ["FPS"]), game(4, ["FPS"])], context);
    expect(result.items[0].reasons).toEqual([{ kind: "history", tag: "Puzzle", gameName: "Game 1" }]);
    expect(result.items[1].reasons).toEqual([{ kind: "explore" }]);
  });

  it("adds variety within a preference tier while staying deterministic and leaving input intact", () => {
    const catalog = [...[1, 2, 3, 4, 5, 6].map((id) => game(id, ["Puzzle"], 5)), game(7, ["Racing"], 4)];
    const context = { ...empty(), preferences: { preferredTags: ["Puzzle", "Racing"], avoidedTags: [] } };
    const before = JSON.stringify({ catalog, context });
    const result = recommendForPlayer(catalog, context);
    expect(ids(result).slice(0, 2)).toEqual([1, 7]);
    expect(recommendForPlayer([...catalog].reverse(), context)).toEqual(result);
    expect(JSON.stringify({ catalog, context })).toBe(before);
  });
});
