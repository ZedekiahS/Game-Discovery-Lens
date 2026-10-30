import { describe, expect, it } from "vitest";
import { games } from "../src/data/games";
import { filterGames, parseSearchIntent } from "../src/lib/search";
import contract from "../../tests/fixtures/search-contract.json";
import boundaries from "../../tests/fixtures/search-evaluation-boundaries.json";
import unseen from "../../tests/fixtures/search-evaluation-unseen.json";
import negation from "../../tests/fixtures/search-negation.json";
import semantics from "../../tests/fixtures/tag-semantics.json";

const tags = [...new Set(games.flatMap((game) => game.tags))];

describe("shared directional tag families", () => {
  it.each(semantics.cases)("$query", ({ query, expected, gameIds }) => {
    const intent = parseSearchIntent(query, semantics.availableTags);
    expect(intent).toMatchObject(expected);
    expect(filterGames(semantics.games, intent).map(game => game.id)).toEqual(gameIds);
  });
  it.each(semantics.unsupported)("rejects impossible family conditions: %s", query => {
    expect(() => parseSearchIntent(query, semantics.availableTags)).toThrow();
  });
});

describe("shared negative type conditions", () => {
  it.each(negation.cases)("$query", ({ query, expected, gameIds }) => {
    const intent = parseSearchIntent(query, negation.availableTags, negation.games.map(g => g.name));
    expect({ ...intent, excludedTags: intent.excludedTags ?? [] }).toMatchObject(expected);
    expect(filterGames(negation.games, intent).map(g => g.id)).toEqual(gameIds);
  });
  it.each(negation.unsupported)("rejects unsupported/conflicting conditions: %s", query => {
    expect(() => parseSearchIntent(query, negation.availableTags)).toThrow();
  });
  it("rejects exclusion against an empty tag catalog without crashing", () => {
    expect(() => parseSearchIntent("without unicorn", [])).toThrow("Only game-type exclusions");
  });
  it.each(["without horror", "不要恐怖"])("excludes both catalog horror classifications: %s", query => {
    const intent = parseSearchIntent(query, tags, games.map(g => g.name));
    expect(intent.excludedTags).toEqual(["Horror", "Survival Horror"]);
    expect(filterGames(games, intent).every(g => !g.tags.some(t => ["Horror", "Survival Horror"].includes(t)))).toBe(true);
  });
});

describe("literal title search", () => {
  it("finds Celeste instead of returning an unrelated catalog", () => {
    const intent = parseSearchIntent("Celeste", tags);
    expect(intent).toMatchObject({ titleQuery: "celeste", maxPrice: null });
    expect(filterGames(games, intent).map((game) => game.name)).toEqual(["Celeste"]);
  });

  it("keeps decimal budgets when combined with a title", () => {
    expect(parseSearchIntent("Find Celeste under 20.99", tags)).toMatchObject({
      titleQuery: "celeste", maxPrice: 20.99,
    });
  });

  it("does not impose an unrequested budget on blank searches", () => {
    const premium = { ...games[0], id: 999, name: "Premium", price: 90 };
    expect(filterGames([premium], parseSearchIntent("  ", tags))).toEqual([premium]);
  });
});

describe("shared frontend and API search contract", () => {
  it.each(contract.cases)("$query", ({ query, expected, gameIds }) => {
    const intent = parseSearchIntent(query, contract.availableTags, contract.games.map((game) => game.name));
    expect(intent).toMatchObject(expected);
    expect(filterGames(contract.games, intent).map((game) => game.id)).toEqual(gameIds);
  });
});

describe("evaluation boundary contract", () => {
  it.each(boundaries.cases)("$id: $query", ({ query, expected, gameIds }) => {
    const intent = parseSearchIntent(query, boundaries.availableTags, boundaries.games.map((game) => game.name));
    expect(intent).toEqual(expected);
    expect(filterGames(boundaries.games, intent).map((game) => game.id)).toEqual(gameIds);
  });
});

describe("unseen evaluation contract", () => {
  it.each(unseen.cases)("$id: $query", ({ query, expected, gameIds }) => {
    const intent = parseSearchIntent(query, unseen.availableTags, unseen.games.map((game) => game.name));
    expect(intent).toEqual(expected);
    expect(filterGames(unseen.games, intent).map((game) => game.id)).toEqual(gameIds);
  });
});

describe("free-price conditions and literal titles", () => {
  it.each([
    "Find free FPS games",
    "Find FREE FPS games",
    "Find free-to-play FPS games",
    "Find free to play FPS games",
    "找免费的FPS游戏",
    "免费FPS游戏",
    "Find free FPS games under 20",
    "找20美元以下的免费FPS游戏",
  ])("treats free as a zero-price ceiling without leaving title text: %s", (query) => {
    const intent = parseSearchIntent(query, boundaries.availableTags);
    expect(intent).toEqual({
      titleQuery: null, maxPrice: 0, minRating: 0, hasReviews: false,
      tags: ["FPS"], mode: "player", sortBy: null, sortDirection: "asc", limit: null, offset: 0,
    });
    expect(filterGames(boundaries.games, intent).map((game) => game.id)).toEqual([101]);
  });

  it.each(["Freeport", "Free to Play", "Fixture Free FPS", "免费之城"])("protects a complete known or quoted title: %s", (name) => {
    const paidGame = { ...games[0], name, price: 20 };
    for (const [query, titles] of [[name, [name]], [`"${name}"`, []]] as const) {
      const intent = parseSearchIntent(query, boundaries.availableTags, [...titles]);
      expect(intent).toMatchObject({ titleQuery: name.toLowerCase(), maxPrice: null, tags: [] });
      expect(filterGames([paidGame], intent)).toEqual([paidGame]);
    }
  });

  it("applies conditions outside a protected title", () => {
    expect(parseSearchIntent('Find "Free to Play" free under 20', [])).toMatchObject({
      titleQuery: "free to play", maxPrice: 0, tags: [],
    });
  });

  it.each(["Freeport", "Carefree", "Free2Play"])("does not infer free prices from part of an unknown word: %s", (query) => {
    expect(parseSearchIntent(query, [])).toMatchObject({ titleQuery: query.toLowerCase(), maxPrice: null });
  });
});

describe("existing search examples", () => {
  it.each([
    ["找第二贵的FPS游戏", "Find the second most expensive FPS game"],
    ["找便宜且有评价的多人生存游戏", "Find cheap multiplayer survival games with good reviews"],
    ["找25美元以下的高评分剧情游戏", "Show highly rated story rich games under 25 dollars"],
    ["为开发者分析探索类游戏", "Find exploration games for developer catalog analysis"],
  ])("keeps Chinese preset semantics equivalent: %s", (chinese, english) => {
    expect(parseSearchIntent(chinese, tags)).toEqual(parseSearchIntent(english, tags));
  });

  it("retains the developer catalog and Chinese tag examples", () => {
    expect(parseSearchIntent("Find premium exploration games for developer catalog analysis", ["Exploration"])).toMatchObject({
      titleQuery: null, tags: ["Exploration"], maxPrice: null, mode: "developer",
    });
    expect(parseSearchIntent("找最便宜的多人 生存 game", ["Multiplayer", "Survival"])).toMatchObject({
      titleQuery: null, tags: ["Multiplayer", "Survival"], maxPrice: null,
      sortBy: "price", sortDirection: "asc", limit: 1,
    });
  });

  it("treats title punctuation literally", () => {
    const title = { ...games[0], name: "A_B (Test)" };
    const other = { ...games[0], name: "AXB (Test)" };
    expect(filterGames([title, other], parseSearchIntent('"A_B (Test)"', []))).toEqual([title]);
  });
});
