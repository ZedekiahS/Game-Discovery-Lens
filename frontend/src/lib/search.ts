import type { Game, GameSignal, SearchIntent } from "../types";

const defaultIntent: SearchIntent = {
  titleQuery: null,
  maxPrice: null,
  minRating: 0,
  hasReviews: false,
  tags: [],
  mode: "player",
  sortBy: null,
  sortDirection: "asc",
  limit: null,
  offset: 0,
};

const pricePatterns = [
  /(?<![a-z0-9])(?:under|below|less than)\s+\$?(\d+(?:\.\d+)?)(?![\d.])/,
  /(?<![\d.])(\d+(?:\.\d+)?)\s*美元\s*以下/,
  /低于\s*\$?(\d+(?:\.\d+)?)(?![\d.])\s*(?:美元)?/,
];

const freePricePattern = /(?<![a-z0-9])free(?:-to-play|\s+to\s+play)?(?![a-z0-9])|免费/;

const tagAliases: Record<string, string[]> = {
  Racing: ["竞速", "赛车"], Rhythm: ["节奏音乐", "音游"], VR: ["虚拟现实"],
  Building: ["自由建造"], "Auto Battler": ["自动战斗", "自走棋"], "Tower Defense": ["塔防"],
  "Turn-Based": ["回合制"], "Real-Time Strategy": ["即时战略"], "Visual Novel": ["视觉小说"], Physics: ["物理互动"],
  Action: ["动作"],
  Adventure: ["冒险"],
  Atmospheric: ["氛围", "沉浸"],
  "Card Battler": ["卡牌"],
  "Co-op": ["合作", "协作"],
  Crafting: ["制作", "建造"],
  Exploration: ["探索"],
  FPS: ["第一人称射击"],
  Management: ["管理"],
  Multiplayer: ["多人", "联机"],
  "Open World": ["开放世界"],
  Puzzle: ["解谜", "谜题"],
  RPG: ["角色扮演"],
  Roguelike: ["肉鸽"],
  Shooter: ["射击", "枪战"],
  Simulation: ["模拟"],
  Singleplayer: ["单人"],
  Space: ["太空"],
  "Story Rich": ["剧情", "故事"],
  Strategy: ["策略"],
  Survival: ["生存"],
  "Survival Horror": ["恐怖", "生存恐怖"],
};

export function parseSearchIntent(query: string, availableTags: string[], availableTitles: string[] = []): SearchIntent {
  const { title, remaining } = extractTitle(query, availableTitles);
  const text = remaining.toLowerCase();
  const intent: SearchIntent = { ...defaultIntent, tags: [] };

  const explicitPrice = pricePatterns.map((pattern) => text.match(pattern)).find(Boolean);
  if (freePricePattern.test(text)) {
    intent.maxPrice = 0;
  } else if (explicitPrice) {
    intent.maxPrice = Number(explicitPrice[1]);
  } else if (isBudgetPriceQuery(text)) {
    intent.maxPrice = 35;
  }

  if (hasAny(text, ["highly rated", "top rated", "高评分"])) {
    intent.minRating = 4.4;
    intent.hasReviews = true;
  } else if (hasAny(text, ["good reviews", "review", "reviews", "rated", "有评价"])) {
    intent.hasReviews = true;
  }

  if (hasAny(text, ["developer", "catalog", "revenue", "开发者"])) {
    intent.mode = "developer";
  }

  applyRankingIntent(text, intent);

  const tags = new Set<string>();
  for (const tag of availableTags) if (tagPattern(tag).test(text)) tags.add(tag);

  if (tagPattern("story").test(text) && availableTags.includes("Story Rich")) tags.add("Story Rich");
  if (tagPattern("horror").test(text) && availableTags.includes("Survival Horror")) tags.add("Survival Horror");

  addAliasTags(text, tags, availableTags);

  intent.tags = prioritizeTags([...tags].sort(), text);
  intent.titleQuery = normalizeTitle([title, remainingTitle(text, availableTags, intent)].filter(Boolean).join(" "));
  return intent;
}

export function filterGames(games: Game[], intent: SearchIntent): Game[] {
  const filteredGames = games.filter((game) => {
    const titleMatch = !intent.titleQuery || game.name.toLowerCase().includes(intent.titleQuery.toLowerCase());
    const priceMatch = intent.maxPrice === null || game.price <= intent.maxPrice;
    const ratingMatch = game.rating >= intent.minRating;
    const reviewMatch = !intent.hasReviews || game.reviewCount > 0;
    const tagMatch = intent.tags.length === 0 || intent.tags.every((tag) => game.tags.includes(tag));
    return titleMatch && priceMatch && ratingMatch && reviewMatch && tagMatch;
  });

  return rankGames(filteredGames, intent);
}

function normalizeTitle(value: string | null): string | null {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() || null;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagPattern(value: string, global = false): RegExp {
  // ASCII boundaries also recognize mixed queries such as 第二贵的FPSgame.
  return new RegExp(`(?<![a-z0-9])${escapePattern(value)}(?=$|[^a-z0-9]|games?\\b)`, global ? "gi" : "i");
}

function extractTitle(query: string, availableTitles: string[]) {
  const quoted = /"([^"\n]+)"|“([^”\n]+)”|(?<![a-z0-9])'([^'\n]+)'(?![a-z0-9])/i.exec(query);
  if (quoted) {
    return { title: quoted[1] ?? quoted[2] ?? quoted[3], remaining: query.replace(quoted[0], " ") };
  }

  for (const title of [...availableTitles].sort((first, second) => second.length - first.length || first.toLowerCase().localeCompare(second.toLowerCase()))) {
    if (!title.trim()) continue;
    const pattern = new RegExp(`(?<![a-z0-9])${escapePattern(title)}(?![a-z0-9])`, "i");
    const match = pattern.exec(query);
    if (match) {
      // A title named "Expensive FPS" must not consume "most expensive FPS" ranking.
      if (/\b(?:most|least|highest|lowest)\s+$/i.test(query.slice(0, match.index))) continue;
      return { title: match[0], remaining: query.replace(pattern, " ") };
    }
  }
  return { title: null, remaining: query };
}

function remainingTitle(text: string, availableTags: string[], intent: SearchIntent): string {
  let remaining = text.replace(new RegExp(freePricePattern.source, "g"), " ");
  for (const pattern of pricePatterns) remaining = remaining.replace(new RegExp(pattern.source, "g"), " ");
  for (const tag of [...availableTags].sort((first, second) => second.length - first.length)) {
    remaining = remaining.replace(tagPattern(tag, true), " ");
  }
  for (const [canonical, aliases] of Object.entries(tagAliases)) {
    if (!availableTags.includes(canonical)) continue;
    for (const alias of [...aliases].sort((first, second) => second.length - first.length)) {
      remaining = remaining.split(alias).join(" ");
    }
  }
  if (availableTags.includes("Story Rich")) remaining = remaining.replace(tagPattern("story", true), " ");
  if (availableTags.includes("Survival Horror")) remaining = remaining.replace(tagPattern("horror", true), " ");

  remaining = remaining.replace(/(?<![a-z0-9])(?:most expensive|highest price|priciest|cheapest|lowest price|least expensive|highest rated|top rated|best rated|highly rated|most reviewed|review volume|most reviews|most recent|highest revenue|most revenue|top revenue|most owned|highest ownership|good reviews|cheap|deal|best|newest|latest|oldest|reviews?|rated)(?![a-z0-9])/g, " ");
  remaining = remaining.replace(/\btop\s+\d{1,2}\b|\b(?:show|find|give me|list)\s+(?:the\s+)?\d{1,2}\b/g, " ");
  remaining = remaining.replace(/\b(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\b|第[一二三四五]\s*贵|最便宜|最贵|便宜|第[一二三四五]/g, " ");
  if (intent.mode === "developer") remaining = remaining.replace(/\b(?:developer|catalog|revenue|market|analysis)\b|开发者|分析/g, " ");
  if (intent.hasReviews) remaining = remaining.replace(/高评分|有评价/g, " ");

  remaining = remaining.replace(/\b(?:show|find|give\s+me|list|all|the|a|an|me|games?|please|with|and|for|of|dollars?|usd|premium)\b/g, " ");
  if (intent.tags.length > 0 || intent.sortBy !== null || intent.maxPrice !== null || intent.hasReviews || intent.mode === "developer") {
    // Only consume connector segments separated by recognized conditions, preserving unknown words.
    remaining = remaining.replace(/(^|\s)(?:找|为|且|的|类|游戏)+(?=\s|$)/g, " ");
  }
  return remaining.replace(/^[\s,;:!?，；：！？]+|[\s,;:!?，；：！？]+$/g, "");
}

export function getSignal(game: Game): GameSignal {
  if (game.rating >= 4.6 && game.reviewCount >= 150) return "Strong";
  if (game.rating >= 4.1) return "Watch";
  return "Risk";
}

function prioritizeTags(tags: string[], text: string): string[] {
  const priority: string[] = [];
  const push = (tag: string) => {
    if (tags.includes(tag) && !priority.includes(tag)) priority.push(tag);
  };

  if (text.includes("multiplayer")) push("Multiplayer");
  if (text.includes("survival")) push("Survival");
  if (text.includes("story")) push("Story Rich");
  if (text.includes("exploration")) push("Exploration");
  if (text.includes("puzzle")) push("Puzzle");

  for (const tag of tags) push(tag);
  return priority.slice(0, 3);
}

function applyRankingIntent(text: string, intent: SearchIntent) {
  if (hasAny(text, ["most expensive", "highest price", "priciest"]) || text.includes("最贵") || /第[一二三四五]\s*贵/.test(text)) {
    intent.sortBy = "price";
    intent.sortDirection = "desc";
    if (shouldLimitSuperlative(text)) intent.limit = 1;
  } else if (hasAny(text, ["cheapest", "lowest price", "least expensive"]) || text.includes("最便宜")) {
    intent.sortBy = "price";
    intent.sortDirection = "asc";
    if (shouldLimitSuperlative(text)) intent.limit = 1;
  } else if (hasAny(text, ["cheap", "deal"]) || text.includes("便宜")) {
    intent.sortBy = "price";
    intent.sortDirection = "asc";
  } else if (hasAny(text, ["highest rated", "top rated", "best rated", "highly rated", "高评分"]) || /\bbest\b/.test(text)) {
    intent.sortBy = "rating";
    intent.sortDirection = "desc";
  } else if (hasAny(text, ["most reviewed", "review volume", "most reviews"])) {
    intent.sortBy = "review_count";
    intent.sortDirection = "desc";
  } else if (hasAny(text, ["newest", "latest", "most recent"])) {
    intent.sortBy = "release_year";
    intent.sortDirection = "desc";
  } else if (hasAny(text, ["oldest"])) {
    intent.sortBy = "release_year";
    intent.sortDirection = "asc";
  } else if (hasAny(text, ["highest revenue", "most revenue", "top revenue"])) {
    intent.sortBy = "revenue";
    intent.sortDirection = "desc";
  } else if (hasAny(text, ["most owned", "highest ownership"])) {
    intent.sortBy = "ownership";
    intent.sortDirection = "desc";
  }

  const requestedLimit = parseRequestedLimit(text);
  if (requestedLimit !== null) {
    intent.limit = requestedLimit;
    if (intent.sortBy === null) {
      intent.sortBy = "rating";
      intent.sortDirection = "desc";
    }
  }

  const ordinalRank = parseOrdinalRank(text);
  if (ordinalRank !== null) {
    intent.offset = ordinalRank - 1;
    intent.limit = 1;
  }
}

function isBudgetPriceQuery(text: string) {
  if (hasAny(text, ["cheapest", "lowest price", "least expensive"]) || text.includes("最便宜")) return false;
  return hasAny(text, ["cheap", "deal"]) || text.includes("便宜");
}

function shouldLimitSuperlative(text: string) {
  if (parseRequestedLimit(text) !== null) return false;
  if (/\b(?:all|list)\b/.test(text)) return false;
  if (/\bgames\b/.test(text) && !/\bgame\b/.test(text)) return false;
  return true;
}

function rankGames(games: Game[], intent: SearchIntent): Game[] {
  const sortedGames = [...games].sort((first, second) => {
    const comparison = compareGames(first, second, intent);
    return comparison === 0 ? first.name.localeCompare(second.name) : comparison;
  });
  const offset = Math.max(0, intent.offset);
  const end = intent.limit === null ? undefined : offset + Math.max(1, intent.limit);
  return sortedGames.slice(offset, end);
}

function compareGames(first: Game, second: Game, intent: SearchIntent) {
  const sortBy = intent.sortBy ?? "name";
  const firstValue = getSortValue(first, sortBy);
  const secondValue = getSortValue(second, sortBy);
  const direction = intent.sortDirection === "desc" ? -1 : 1;

  if (typeof firstValue === "string" && typeof secondValue === "string") {
    return firstValue.localeCompare(secondValue) * direction;
  }
  return (Number(firstValue) - Number(secondValue)) * direction;
}

function getSortValue(game: Game, sortBy: NonNullable<SearchIntent["sortBy"]>) {
  if (sortBy === "review_count") return game.reviewCount;
  if (sortBy === "release_year") return game.releaseYear;
  return game[sortBy];
}

function parseRequestedLimit(text: string) {
  const patterns = [/\btop\s+(\d{1,2})\b/, /\b(?:show|find|give me|list)\s+(?:the\s+)?(\d{1,2})\b/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.max(1, Math.min(Number(match[1]), 50));
  }
  return null;
}

function parseOrdinalRank(text: string) {
  const chineseOrdinals: Record<string, number> = {
    "第一": 1,
    "第二": 2,
    "第三": 3,
    "第四": 4,
    "第五": 5,
  };
  for (const [token, rank] of Object.entries(chineseOrdinals)) {
    if (text.includes(token)) return rank;
  }

  const ordinalWords: Record<string, number> = {
    first: 1,
    "1st": 1,
    second: 2,
    "2nd": 2,
    third: 3,
    "3rd": 3,
    fourth: 4,
    "4th": 4,
    fifth: 5,
    "5th": 5,
  };
  for (const [token, rank] of Object.entries(ordinalWords)) {
    if (new RegExp(`\\b${token}\\b`).test(text)) return rank;
  }
  return null;
}

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => new RegExp(`(?<![a-z0-9])${escapePattern(phrase)}(?![a-z0-9])`).test(text));
}

function addAliasTags(text: string, tags: Set<string>, availableTags: string[]) {
  const availableTagLookup = new Map(availableTags.map((tag) => [tag.toLowerCase(), tag]));
  for (const [canonicalTag, aliases] of Object.entries(tagAliases)) {
    const tag = availableTagLookup.get(canonicalTag.toLowerCase());
    if (tag && aliases.some((alias) => text.includes(alias))) {
      tags.add(tag);
    }
  }
}
