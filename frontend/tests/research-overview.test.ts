import { describe, expect, it } from "vitest";
import { researchGames, summarizeCatalog } from "../src/lib/researchOverview";
import type { Game } from "../src/types";
import { filterGames } from '../src/lib/search';
import { defaultIntent } from '../src/lib/discoveryLocation';
import { games as demoGames } from '../src/data/games';

function game(id: number, overrides: Partial<Game> = {}): Game {
  return {
    id, name: `Game ${id}`, rating: 4, reviewCount: 100, price: 20, releaseYear: 2024,
    developer: "Example", publisher: "Example", tags: ["Puzzle"],
    summary: "Example game", revenue: 0, ownership: 0, ...overrides,
  };
}

describe("catalog overview", () => {
  it('uses the same tag families for overview counts and drilldown results', () => {
    for (const { tag, count } of summarizeCatalog(demoGames).topTags) {
      expect(filterGames(demoGames, { ...defaultIntent('developer'), tags: [tag] })).toHaveLength(count);
    }
    expect(summarizeCatalog([game(1, { tags: ['Co-op', 'Multiplayer'] }), game(2, { tags: ['Co-op'] })]).topTags)
      .toContainEqual({ tag: 'Multiplayer', count: 2 });
  });
  it("includes free games and all ratings in averages, and counts distinct nonempty developer names", () => {
    const catalog = [
      game(1, { price: 0, rating: 0, developer: " Example " }),
      game(2, { price: 20, rating: 4, developer: "Example" }),
      game(3, { price: 40, rating: 5, developer: "Other" }),
      game(4, { price: 0, rating: 3, developer: "   " }),
    ];
    expect(summarizeCatalog(catalog)).toMatchObject({
      gameCount: 4, developerCount: 2, averagePrice: 15, averageRating: 3,
    });
    expect(summarizeCatalog([game(1, { price: 0 })]).averagePrice).toBe(0);
  });

  it("counts each tag once per game and orders the six leading tags deterministically", () => {
    const catalog = [
      game(1, { tags: ["Puzzle", "Puzzle", "Action", "Strategy", "RPG", "Indie"] }),
      game(2, { tags: ["Puzzle", "Action", "Adventure", "Simulation"] }),
    ];
    const before = structuredClone(catalog);
    const expected = [
      { tag: "Action", count: 2 }, { tag: "Puzzle", count: 2 },
      { tag: "Adventure", count: 1 }, { tag: "Indie", count: 1 },
      { tag: "RPG", count: 1 }, { tag: "Simulation", count: 1 },
    ];
    expect(summarizeCatalog(catalog).topTags).toEqual(expected);
    expect(summarizeCatalog([...catalog].reverse()).topTags).toEqual(expected);
    expect(catalog).toEqual(before);
  });

  it("does not invent averages or tags for an empty catalog", () => {
    expect(summarizeCatalog([])).toEqual({
      gameCount: 0, developerCount: 0, averagePrice: null, averageRating: null, topTags: [],
    });
  });
});

describe("research starting points", () => {
  it("ranks six games by review volume, rating, title, and ID without modifying the catalog", () => {
    const catalog = [
      game(9, { name: "Same", rating: 4.8, reviewCount: 1000 }),
      game(8, { name: "Same", rating: 4.8, reviewCount: 1000 }),
      game(7, { name: "Alpine", rating: 4.8, reviewCount: 1000 }),
      game(6, { name: "Higher rating", rating: 4.9, reviewCount: 1000 }),
      game(5, { name: "Most reviewed", rating: 3, reviewCount: 2000 }),
      game(4, { name: "Sixth", rating: 4, reviewCount: 1000 }),
      game(3, { name: "Few reviews", rating: 5, reviewCount: 100 }),
    ];
    const before = structuredClone(catalog);
    expect(researchGames(catalog).map(({ id }) => id)).toEqual([5, 6, 7, 8, 9, 4]);
    expect(researchGames([...catalog].reverse()).map(({ id }) => id)).toEqual([5, 6, 7, 8, 9, 4]);
    expect(catalog).toEqual(before);
  });

  it("returns all available games for small catalogs and no games for an empty catalog", () => {
    const onlyGame = game(1);
    expect(researchGames([onlyGame])).toEqual([onlyGame]);
    expect(researchGames([])).toEqual([]);
  });
});
