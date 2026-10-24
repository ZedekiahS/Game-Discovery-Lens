import { describe, expect, it } from "vitest";
import { games } from "../src/data/games";
import { hasOriginalInsightContent, localizeCollectionInsights, localizeGameInsights, localizeGameSummary } from "../src/i18n/content";
import { demoCatalog } from "../src/services/catalog/demo";
import type { Game, GameInsights, InsightPanelContent, SavedGame } from "../src/types";

const panelKeys = ["reviewIntelligence", "developerOpportunity", "playerRecommendation"] as const;
const numerals = (panel: InsightPanelContent) => [panel.body, ...panel.bullets].join(" ").match(/\d+(?:\.\d+)?(?:[KM])?/g) ?? [];

function saved(game: Game, id: number): SavedGame {
  return { id, gameId: game.id, game, userId: "custom-account", collectionId: 7, createdAt: "2026-09-15T00:00:00.000Z" };
}

describe("bilingual catalog content", () => {
  it("translates every shipped game summary without changing catalog data or English content", () => {
    const originalCatalog = JSON.stringify(games);
    expect(games).toHaveLength(80);
    for (const game of games) {
      expect(localizeGameSummary(game, "zh"), game.name).toMatch(/[\u4e00-\u9fff]/);
      expect(localizeGameSummary(game, "zh"), game.name).not.toBe(game.summary);
      expect(localizeGameSummary(game, "en")).toBe(game.summary);
    }
    expect(JSON.stringify(games)).toBe(originalCatalog);
  });

  it("localizes all demo insight panels while preserving identifiers, sources, titles and numeric facts", async () => {
    for (const game of games) {
      const insights = await demoCatalog.getGameInsights(game);
      const before = JSON.stringify(insights);
      const localized = localizeGameInsights(game, insights, "zh");
      expect(localized.gameId).toBe(game.id);
      expect(localized.source).toBe(insights.source);
      expect(localized.signal).toBe(insights.signal);
      expect(localized.reviewIntelligence.body).toContain(game.name);
      expect(localized.developerOpportunity.body).toContain(game.developer);
      for (const key of panelKeys) {
        expect(hasOriginalInsightContent(insights[key], localized[key], "zh"), `${game.name}: ${key}`).toBe(false);
        expect(localized[key].body).toMatch(/[\u4e00-\u9fff]/);
        expect(numerals(localized[key]), `${game.name}: ${key}`).toEqual(numerals(insights[key]));
        expect(localized[key].bullets).toHaveLength(insights[key].bullets.length);
      }
      expect(localizeGameInsights(game, insights, "en")).toBe(insights);
      expect(JSON.stringify(insights)).toBe(before);
    }
  });

  it("recognizes backend rules wording without fabricating review evidence", async () => {
    const game = games.find((candidate) => candidate.name === "Aimlabs")!;
    // API and demo rules share these evidence-limited templates.
    const insights: GameInsights = { ...await demoCatalog.getGameInsights(game), source: "rules" };
    const localized = localizeGameInsights(game, insights, "zh");
    expect(localized.source).toBe("rules");
    expect(localized.signal).toBe("Watch");
    expect(localized.playerRecommendation.body).toContain("玩法");
    for (const key of panelKeys) {
      expect(hasOriginalInsightContent(insights[key], localized[key], "zh"), key).toBe(false);
      expect(numerals(localized[key])).toEqual(numerals(insights[key]));
    }
  });

  it("keeps changed summaries and unfamiliar insight bodies verbatim instead of replacing their meaning", async () => {
    const game = { ...games[0], summary: "An updated description supplied by the API." };
    expect(localizeGameSummary(game, "zh")).toBe(game.summary);
    const original = await demoCatalog.getGameInsights(game);
    const insights = {
      ...original,
      reviewIntelligence: { ...original.reviewIntelligence, body: "New analysis: retention dropped by 12%." },
      playerRecommendation: { ...original.playerRecommendation, bullets: ["External caveat: keyboard required."] },
    };
    const localized = localizeGameInsights(game, insights, "zh");
    expect(localized.reviewIntelligence).toBe(insights.reviewIntelligence);
    expect(localized.playerRecommendation.body).not.toBe(insights.playerRecommendation.body);
    expect(localized.playerRecommendation.bullets).toEqual(insights.playerRecommendation.bullets);
    expect(hasOriginalInsightContent(insights.reviewIntelligence, localized.reviewIntelligence, "zh")).toBe(true);
    expect(hasOriginalInsightContent(insights.playerRecommendation, localized.playerRecommendation, "zh")).toBe(true);
    expect(hasOriginalInsightContent(insights.reviewIntelligence, localized.reviewIntelligence, "en")).toBe(false);
  });

  it("preserves DeepSeek content even when it happens to resemble a known rule template", async () => {
    const game = games[0];
    const insights: GameInsights = { ...await demoCatalog.getGameInsights(game), source: "deepseek" };
    const localized = localizeGameInsights(game, insights, "zh");
    expect(localized).toBe(insights);
    expect(hasOriginalInsightContent(insights.playerRecommendation, localized.playerRecommendation, "zh")).toBe(true);
  });

  it("translates collection analysis without changing saved games, custom titles, tags or aggregate facts", async () => {
    const customGame = { ...games[0], name: "Commander / 自定义标题", rating: 4.9 };
    const savedGames = [saved(customGame, 1), saved(games[1], 2)];
    const originalSaved = JSON.stringify(savedGames);
    const insights = await demoCatalog.getShortlistInsights(savedGames, "custom-account");
    const originalInsights = JSON.stringify(insights);
    const localized = localizeCollectionInsights(insights, savedGames, "zh");
    const { strategy: originalStrategy, ...originalFacts } = insights;
    const { strategy, ...localizedFacts } = localized;
    expect(localizedFacts).toEqual(originalFacts);
    expect(strategy.body).toContain("不能据此确认市场需求");
    expect(hasOriginalInsightContent(originalStrategy, strategy, "zh")).toBe(false);
    expect(numerals(strategy)).toEqual(numerals(originalStrategy));
    expect(localizeCollectionInsights(insights, savedGames, "en")).toBe(insights);
    expect(JSON.stringify(insights)).toBe(originalInsights);
    expect(JSON.stringify(savedGames)).toBe(originalSaved);
  });

  it("localizes the empty collection guidance and retains unknown or AI collection analysis", async () => {
    const empty = await demoCatalog.getShortlistInsights([], "custom-account");
    const localized = localizeCollectionInsights(empty, [], "zh");
    expect(hasOriginalInsightContent(empty.strategy, localized.strategy, "zh")).toBe(false);
    expect(localized.savedCount).toBe(0);
    const unknown = { ...empty, strategy: { ...empty.strategy, body: "Custom collection advice." } };
    expect(localizeCollectionInsights(unknown, [], "zh").strategy).toBe(unknown.strategy);
    const generated = { ...empty, source: "deepseek" as const };
    expect(localizeCollectionInsights(generated, [], "zh")).toBe(generated);
  });
});
