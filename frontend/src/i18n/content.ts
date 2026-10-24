import type { Game, GameInsights, InsightPanelContent, SavedGame, ShortlistInsights } from "../types";
import catalog from "../../../catalog/demo-catalog.json";
import { translateTag } from "./tags";

type Language = "en" | "zh";

// Exact text keys keep changed API descriptions and external content intact.
const summaries: Record<string, string> = Object.fromEntries(
  catalog.map((record) => [record.summary, record.summaryZh]),
);

export function localizeGameSummary(game: Game, language: Language): string {
  return language === "zh" ? summaries[game.summary] ?? game.summary : game.summary;
}

function compact(value: number, source: "rules" | "mock") {
  if (source === "mock") return Intl.NumberFormat("en", { notation: "compact" }).format(value);
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function money(value: number) {
  return value === 0 ? "Free" : `$${value.toFixed(2)}`;
}

function translatePanel(panel: InsightPanelContent, expectedBody: string, translatedBody: string, entries: [string, string][]): InsightPanelContent {
  // Only a recognized body enables template translation; unknown bullets still pass through.
  if (panel.body !== expectedBody) return panel;
  const translations = new Map(entries);
  return {
    title: translations.get(panel.title) ?? panel.title,
    caption: translations.get(panel.caption) ?? panel.caption,
    body: translatedBody,
    bullets: panel.bullets.map((bullet) => translations.get(bullet) ?? bullet),
  };
}

/** Show an original-content notice whenever any body or bullet was not translated. */
export function hasOriginalInsightContent(original: InsightPanelContent, localized: InsightPanelContent, language: Language): boolean {
  return language === "zh" && (
    (Boolean(original.body) && original.body === localized.body) ||
    original.bullets.some((bullet, index) => Boolean(bullet) && bullet === localized.bullets[index])
  );
}

export function localizeGameInsights(game: Game, insights: GameInsights, language: Language): GameInsights {
  if (language === "en" || (insights.source !== "mock" && insights.source !== "rules")) return insights;
  const source = insights.source;
  const primary = game.tags[0] ?? "genre";
  const secondary = game.tags.slice(1, 3);
  const adjacent = secondary.length ? secondary : game.tags.slice(0, 1);
  const phrase = adjacent.length ? adjacent.join(" and ") : source === "rules" ? "adjacent audiences" : primary;
  const primaryZh = primary === "genre" ? "该类型" : translateTag(primary, "zh");
  const phraseZh = adjacent.length ? adjacent.map((tag) => translateTag(tag, "zh")).join("与") : source === "rules" ? "相近受众" : primaryZh;
  const playerTagsZh = [...new Set([primaryZh, ...adjacent.map((tag) => translateTag(tag, "zh"))])].join("、");
  const captions: [string, string][] = [["Demo rules", "目录规则"], ["Rules preview", "目录规则"], ["Discovery lens", "发现视角"]];
  return {
    ...insights,
    reviewIntelligence: translatePanel(insights.reviewIntelligence,
      `${game.name} is tagged ${primary}. No review text is available for analysis.`,
      `${game.name} 的编辑标签包含${primaryZh}。目前没有可供分析的评论原文。`,
      [...captions, ["Catalog evidence", "目录依据"], [`Editorial tags: ${phrase}.`, `编辑标签：${phraseZh}。`], ["A review count is not a review corpus.", "评价数量不等于可供分析的评论原文。"]]),
    developerOpportunity: translatePanel(insights.developerOpportunity,
      `${game.developer}'s title is a comparison reference for ${primary}, not evidence of market demand.`,
      `${game.developer} 的这款作品可用于比较${primaryZh}玩法，不能据此确认市场需求。`,
      [...captions, ["Comparison reference", "同类比较"], ["Compare this game's genres with the other games in your collection.", "比较这款游戏与收藏夹中其他作品的类型与风格。"], ["Validate prices and audience metrics independently before making business decisions.", "作出商业决策前，需独立核实价格和受众指标。"]]),
    playerRecommendation: translatePanel(insights.playerRecommendation,
      `Explore this title if you enjoy ${primary} and ${phrase}. Check the gameplay summary before choosing.`,
      `喜欢${playerTagsZh}玩法时，可以进一步了解这款游戏。选择前请阅读玩法摘要。`,
      [...captions, ["Player Recommendation", "玩家推荐"], ["Basis: catalog tags.", "依据：目录标签。"], ["Check the store for current prices and availability.", "当前价格与可购情况请以商店为准。"]]),
  };
}

export function localizeCollectionInsights(insights: ShortlistInsights, savedGames: SavedGame[], language: Language): ShortlistInsights {
  if (language === "en" || (insights.source !== "mock" && insights.source !== "rules")) return insights;
  const headings: [string, string][] = [["Collection Intelligence", "收藏洞察"], ["Demo rules", "演示规则"], ["Rules preview", "规则预览"]];
  if (savedGames.length === 0) {
    return { ...insights, strategy: translatePanel(insights.strategy,
      "Save games to this collection to compare gameplay and genre concentration.",
      "将游戏加入这个收藏夹，比较玩法与类型分布。",
      [...headings,
        ["Start with two or three games from different tags.", "先收藏两到三款不同类型的游戏。"],
        ["Use collections to separate player wishlists from developer research.", "用不同收藏夹分别整理玩家愿望单与开发者研究。"],
        ["Check each game’s source before drawing conclusions.", "作出判断前，请查看每款游戏的资料来源。"]],
    ) };
  }
  const games = savedGames.map((saved) => saved.game);
  const averagePrice = games.reduce((sum, game) => sum + game.price, 0) / games.length;
  const strongest = games.reduce((best, game) => game.rating > best.rating ? game : best, games[0]);
  const position = averagePrice <= 25 ? "accessible" : "premium";
  const tags = insights.topTags.slice(0, 3);
  const phrase = tags.join(", ") || "mixed genres";
  const phraseZh = tags.map((tag) => translateTag(tag, "zh")).join("、") || "多种类型";
  const revenue = insights.totalVisibleRevenue === null ? "—" : compact(insights.totalVisibleRevenue, insights.source);
  return { ...insights, strategy: translatePanel(insights.strategy,
    `This collection groups ${phrase}. Compare gameplay and tags; market demand has not been established.`,
    `这个收藏夹主要包含${phraseZh}。可用于比较玩法和标签，不能据此确认市场需求。`,
    [...headings,
      [`Saved games: ${insights.savedCount}.`, `已收藏游戏：${insights.savedCount} 款。`],
      [`Average price: ${money(averagePrice)}.`, `平均价格：${averagePrice === 0 ? "免费" : money(averagePrice)}。`],
      [`Catalog revenue total: $${revenue}.`, `目录营收合计：$${revenue}。`],
      [`Top tags: ${phrase}.`, `主要类型：${phraseZh}。`]],
  ) };
}
