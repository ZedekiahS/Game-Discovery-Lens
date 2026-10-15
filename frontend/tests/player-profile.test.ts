import { describe, expect, it } from "vitest";
import { buildPlayerProfile } from "../src/lib/playerProfile";
import { games } from "../src/data/games";
import type { GameCollection, PlayerGameRecord, SavedGame } from "../src/types";

const collection = (id: number, purpose?: GameCollection["purpose"]): GameCollection => ({ id, purpose, userId: "a", name: "List", description: "", createdAt: "" });
const saved = (id: number, gameId: number): SavedGame => ({ id, userId: "a", collectionId: id, gameId, game: games.find((g) => g.id === gameId)!, createdAt: "" });
const record = (gameId: number, affinity: PlayerGameRecord["affinity"], status: PlayerGameRecord["status"] = null): PlayerGameRecord => ({ gameId, affinity, status, notes: "", updatedAt: "" });
const preferences = { preferredTags: [], avoidedTags: [] };

describe("evidence-based player profile", () => {
  it("deduplicates personal saves and likes, and excludes research and unclassified saves", () => {
    const profile = buildPlayerProfile(games, [record(2, "like")], [collection(1, "player"), collection(2, "player"), collection(3, "research"), collection(4)], {
      1: [saved(1, 2)], 2: [saved(2, 2)], 3: [saved(3, 5)], 4: [saved(4, 9)],
    }, preferences);
    expect(profile.interestCount).toBe(1);
    expect(profile.interests.find((s) => s.tag === "Platformer")?.games.map((g) => g.id)).toEqual([2]);
    expect(profile.interests.some((s) => s.tag === "FPS")).toBe(false);
    expect(profile.playedCount).toBe(0);
  });
  it("separates dislike from factual play history and does not infer playing from a wishlist", () => {
    const profile = buildPlayerProfile(games, [record(2, "dislike", "played"), record(9, "like", "want_to_play")], [collection(1, "player")], { 1: [saved(1, 2)] }, preferences);
    expect(profile.interestCount).toBe(1);
    expect(profile.playedCount).toBe(1);
    expect(profile.played.find((s) => s.tag === "Platformer")?.games[0].id).toBe(2);
    expect(profile.interests.some((s) => s.tag === "Platformer")).toBe(false);
  });
  it("applies avoided styles without fabricating evidence for explicitly preferred tags", () => {
    const profile = buildPlayerProfile(games, [record(2, "like", "playing")], [], {}, { preferredTags: ["Space"], avoidedTags: ["Difficult"] });
    expect(profile.interests.some((s) => s.tag === "Difficult" || s.tag === "Space")).toBe(false);
    expect(profile.played.some((s) => s.tag === "Difficult")).toBe(true);
    expect(buildPlayerProfile(games, [], [], {}, preferences).interestCount).toBe(0);
  });
  it("removes wrong FPS and card-battler classifications from curated source material", () => {
    for (const name of ["PowerWash Simulator", "Beat Saber", "Tiny Glade", "Portal 2", "Viewfinder"]) expect(games.find((g) => g.name === name)?.tags).not.toContain("FPS");
    expect(games.find((g) => g.name === "Backpack Battles")?.tags).toContain("Auto Battler");
    expect(games.find((g) => g.name === "Backpack Battles")?.tags).not.toContain("Card Battler");
    expect(games.some((g) => /broadens the demo catalog/.test(g.summary))).toBe(false);
  });
});
