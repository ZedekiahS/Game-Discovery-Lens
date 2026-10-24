import { ApiError } from "../http";
import { games } from "../../data/games";
import { filterGames, getSignal, parseSearchIntent } from "../../lib/search";
import type { CollectionPurpose, Game, GameCollection, GameInsights, SavedGame, ShortlistInsights } from "../../types";
import type { CatalogService } from "./contract";

const DEFAULT_COLLECTION_ID = 1;
const DEFAULT_COLLECTION_NAME = "Default Shortlist";
const COLLECTION_STORAGE_KEY = "game-discovery-lens.demo.collections";
const SAVED_COLLECTION_STORAGE_KEY = "game-discovery-lens.demo.savedCollectionGameIds";
const SAVED_TIME_STORAGE_KEY = "game-discovery-lens.demo.savedGameTimes";
const LEGACY_COLLECTION_STORAGE_KEY = "arcadeiq.demo.collections";
const LEGACY_SAVED_COLLECTION_STORAGE_KEY = "arcadeiq.demo.savedCollectionGameIds";

export const demoCatalog: CatalogService = {
  async getCatalog() {
    return games;
  },

  async getCollections(userId) {
    return getLocalCollections(userId);
  },

  async createCollection(name, userId, purpose) {
    return createLocalCollection(name, userId, purpose);
  },

  async updateCollection(collectionId, name, userId, purpose) {
    return updateLocalCollection(collectionId, name, userId, purpose);
  },

  async deleteCollection(collectionId, userId) {
    return deleteLocalCollection(collectionId, userId);
  },

  async getSavedGames(catalog, userId, collectionId) {
    if (collectionId === "all") return getLocalCollections(userId).flatMap((c) => getLocalSavedGames(catalog, userId, c.id));
    return getLocalSavedGames(catalog, userId, collectionId);
  },

  async getShortlistInsights(savedGames, userId) {
    return buildMockShortlistInsights(savedGames, userId);
  },

  async saveGame(game, catalog, userId, collectionId) {
    const savedIds = new Set(readLocalSavedIds(userId, collectionId));
    savedIds.add(game.id);
    writeLocalSavedIds(userId, collectionId, [...savedIds]);
    return buildMockSavedGame(game, catalog, userId, getCollectionId(collectionId));
  },

  async removeSavedGame(gameId, userId, collectionId) {
    writeLocalSavedIds(
      userId,
      collectionId,
      readLocalSavedIds(userId, collectionId).filter((id) => id !== gameId),
    );
  },

  async clearSavedGames(userId, collectionId) {
    return writeLocalSavedIds(userId, collectionId, []);
  },

  async getGameDetail(gameId, catalog) {
    return catalog.find((game) => game.id === gameId) ?? games.find((game) => game.id === gameId) ?? null;
  },

  async getGameInsights(game) {
    return buildMockInsights(game);
  },

  async searchCatalog(query, availableTags, catalog) {
    if (Array.from(query).length > 500) throw new ApiError(422, "query: String should have at most 500 characters");
    const intent = parseSearchIntent(query, availableTags, catalog.map((game) => game.name));
    return { intent, games: filterGames(catalog, intent), source: "mock" };
  },
};

function buildMockInsights(game: Game): GameInsights {
  const signal = getSignal(game);
  const primaryTag = game.tags[0] ?? "genre";
  const secondaryTags = game.tags.slice(1, 3);
  const tagPhrase = secondaryTags.length > 0 ? secondaryTags.join(" and ") : primaryTag;

  return {
    gameId: game.id, signal,
    reviewIntelligence: {
      title: "Catalog evidence", caption: "Demo rules",
      body: `${game.name} is tagged ${primaryTag}. No review text is available for analysis.`,
      bullets: [`Editorial tags: ${tagPhrase}.`, "A review count is not a review corpus."],
    },
    developerOpportunity: {
      title: "Comparison reference", caption: "Demo rules",
      body: `${game.developer}'s title is a comparison reference for ${primaryTag}, not evidence of market demand.`,
      bullets: ["Compare this game's genres with the other games in your collection.", "Validate prices and audience metrics independently before making business decisions."],
    },
    playerRecommendation: {
      title: "Player Recommendation", caption: "Discovery lens",
      body: `Explore this title if you enjoy ${primaryTag} and ${tagPhrase}. Check the gameplay summary before choosing.`,
      bullets: ["Basis: catalog tags.", "Check the store for current prices and availability."],
    },
    source: "mock",
  };
}

function formatCompact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function getCollectionId(collectionId?: number) {
  return collectionId ?? DEFAULT_COLLECTION_ID;
}

function getLocalSavedGames(catalog: Game[], userId: string, collectionId?: number): SavedGame[] {
  const times = readLocalSavedTimes(userId);
  return readLocalSavedIds(userId, collectionId)
    .map((gameId) => catalog.find((game) => game.id === gameId) ?? games.find((game) => game.id === gameId))
    .filter((game): game is Game => Boolean(game))
    .map((game) => buildMockSavedGame(game, catalog, userId, getCollectionId(collectionId), times[`${getCollectionId(collectionId)}:${game.id}`] ?? ""));
}

function buildMockSavedGame(game: Game, catalog: Game[], userId: string, collectionId: number, createdAt = readLocalSavedTimes(userId)[`${collectionId}:${game.id}`] ?? ""): SavedGame {
  const existingIndex = catalog.findIndex((candidate) => candidate.id === game.id);
  return {
    id: collectionId * 1000 + (existingIndex >= 0 ? existingIndex + 1 : game.id),
    userId,
    collectionId,
    gameId: game.id,
    createdAt,
    game,
  };
}

function buildDefaultCollection(userId: string): GameCollection {
  return {
    id: DEFAULT_COLLECTION_ID,
    userId,
    name: DEFAULT_COLLECTION_NAME,
    description: "Games saved for quick comparison.",
    createdAt: "2026-06-11T00:00:00.000Z",
  };
}

function getLocalCollections(userId: string): GameCollection[] {
  const defaultCollection = buildDefaultCollection(userId);
  const rawValue = readBrandedStorage(COLLECTION_STORAGE_KEY, LEGACY_COLLECTION_STORAGE_KEY, userId);
  if (rawValue === null) {
    // Persist the fresh default before the first save so its purpose survives reload.
    // Older saved-game-only storage remains unclassified until its owner chooses.
    if (readBrandedStorage(SAVED_COLLECTION_STORAGE_KEY, LEGACY_SAVED_COLLECTION_STORAGE_KEY, userId) === null) {
      defaultCollection.purpose = "player";
      window.localStorage.setItem(getUserStorageKey(COLLECTION_STORAGE_KEY, userId), JSON.stringify([defaultCollection]));
    }
    return [defaultCollection];
  }
  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) throw new Error("Saved demo collections are not a valid list.");
  const collections = parsed.filter(isGameCollection);
  if (collections.some((collection) => collection.id === DEFAULT_COLLECTION_ID)) {
    return collections;
  }
  return [defaultCollection, ...collections];
}

function createLocalCollection(name: string, userId: string, purpose: CollectionPurpose = "unspecified"): GameCollection {
  if (!name.trim()) throw new ApiError(400, "Collection name is required");
  if (Array.from(name).length > 120) throw new ApiError(422, "name: String should have at most 120 characters");
  name = name.trim();
  const collections = getLocalCollections(userId);
  const existing = collections.find((collection) => collection.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const collection: GameCollection = {
    id: Math.max(...collections.map((item) => item.id), DEFAULT_COLLECTION_ID) + 1,
    userId,
    name,
    description: "",
    purpose,
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(getUserStorageKey(COLLECTION_STORAGE_KEY, userId), JSON.stringify([...collections, collection]));
  return collection;
}

function updateLocalCollection(collectionId: number, name: string, userId: string, purpose?: CollectionPurpose): GameCollection {
  const collections = getLocalCollections(userId);
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) {
    throw new Error("Collection not found");
  }
  if (collection.name === DEFAULT_COLLECTION_NAME && name.trim() !== collection.name) {
    throw new Error("Default collection cannot be renamed");
  }

  if (Array.from(name).length > 120) throw new ApiError(422, "name: String should have at most 120 characters");
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("Collection name is required");
  }

  const duplicate = collections.find(
    (item) => item.id !== collectionId && item.name.toLowerCase() === normalizedName.toLowerCase(),
  );
  if (duplicate) {
    throw new Error("Collection name already exists");
  }

  const updated = { ...collection, name: normalizedName, ...(purpose ? { purpose } : {}) };
  window.localStorage.setItem(
    getUserStorageKey(COLLECTION_STORAGE_KEY, userId),
    JSON.stringify(collections.map((item) => (item.id === collectionId ? updated : item))),
  );
  return updated;
}

function deleteLocalCollection(collectionId: number, userId: string) {
  const collections = getLocalCollections(userId);
  const collection = collections.find((item) => item.id === collectionId);
  if (!collection) return;
  if (collection.name === DEFAULT_COLLECTION_NAME) {
    throw new Error("Default collection cannot be deleted");
  }

  // Read both records before changing either one so failed reads cannot erase data.
  const savedMap = readLocalSavedMap(userId);
  window.localStorage.setItem(
    getUserStorageKey(COLLECTION_STORAGE_KEY, userId),
    JSON.stringify(collections.filter((item) => item.id !== collectionId)),
  );

  delete savedMap[collectionId.toString()];
  window.localStorage.setItem(getUserStorageKey(SAVED_COLLECTION_STORAGE_KEY, userId), JSON.stringify(savedMap));
}

function isGameCollection(value: unknown): value is GameCollection {
  if (!value || typeof value !== "object") return false;
  const collection = value as Partial<GameCollection>;
  return (
    typeof collection.id === "number" &&
    typeof collection.userId === "string" &&
    typeof collection.name === "string" &&
    typeof collection.description === "string" &&
    typeof collection.createdAt === "string"
  );
}

function readLocalSavedIds(userId: string, collectionId?: number): number[] {
  return readLocalSavedMap(userId)[getCollectionId(collectionId).toString()] ?? [];
}

function writeLocalSavedIds(userId: string, collectionId: number | undefined, gameIds: number[]) {
  const savedMap = readLocalSavedMap(userId);
  const id = getCollectionId(collectionId).toString();
  const previous = new Set(savedMap[id] ?? []);
  const times = readLocalSavedTimes(userId);
  for (const gameId of gameIds) if (!previous.has(gameId)) times[`${id}:${gameId}`] = new Date().toISOString();
  for (const gameId of previous) if (!gameIds.includes(gameId)) delete times[`${id}:${gameId}`];
  // Metadata is written first; a failed membership write remains an uncertain operation, never a fake success.
  window.localStorage.setItem(getUserStorageKey(SAVED_TIME_STORAGE_KEY, userId), JSON.stringify(times));
  savedMap[id] = [...new Set(gameIds)];
  window.localStorage.setItem(getUserStorageKey(SAVED_COLLECTION_STORAGE_KEY, userId), JSON.stringify(savedMap));
}

function readLocalSavedTimes(userId: string): Record<string, string> {
  const raw = window.localStorage.getItem(getUserStorageKey(SAVED_TIME_STORAGE_KEY, userId));
  if (raw === null) return {}; // Older saves have unknown dates and sort after dated saves.
  const times = JSON.parse(raw);
  if (!times || typeof times !== "object" || Array.isArray(times)
    || Object.values(times).some((value) => typeof value !== "string" || !Number.isFinite(Date.parse(value)))) {
    throw new Error("Your collection dates could not be loaded.");
  }
  return times;
}

function readLocalSavedMap(userId: string): Record<string, number[]> {
  const rawValue = readBrandedStorage(SAVED_COLLECTION_STORAGE_KEY, LEGACY_SAVED_COLLECTION_STORAGE_KEY, userId);
  if (rawValue === null) return {};
  const parsed = JSON.parse(rawValue);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Saved demo games are not a valid collection map.");
  }
  const savedMap: Record<string, number[]> = {};
  for (const [collectionId, values] of Object.entries(parsed as Record<string, unknown>)) {
    savedMap[collectionId] = Array.isArray(values) ? values.filter((value): value is number => Number.isInteger(value)) : [];
  }
  return savedMap;
}

function getUserStorageKey(baseKey: string, userId: string) {
  return `${baseKey}.${userId}`;
}

function readBrandedStorage(currentBaseKey: string, legacyBaseKey: string, userId: string) {
  const currentKey = getUserStorageKey(currentBaseKey, userId);
  const currentValue = window.localStorage.getItem(currentKey);
  if (currentValue !== null) return currentValue;

  return window.localStorage.getItem(getUserStorageKey(legacyBaseKey, userId));
}

function buildMockShortlistInsights(savedGames: SavedGame[], userId: string): ShortlistInsights {
  const savedCount = savedGames.length;
  if (savedCount === 0) {
    return {
      userId,
      savedCount: 0,
      averagePrice: null,
      averageRating: null,
      totalVisibleRevenue: null,
      topTags: [],
      strategy: {
        title: "Collection Intelligence",
        caption: "Demo rules",
        body: "Save games to this collection to compare gameplay and genre concentration.",
        bullets: [
          "Start with two or three games from different tags.",
          "Use collections to separate player wishlists from developer research.",
          "Check each game’s source before drawing conclusions.",
        ],
      },
      source: "mock",
    };
  }

  const selectedGames = savedGames.map((savedGame) => savedGame.game);
  const averagePrice = selectedGames.reduce((sum, game) => sum + game.price, 0) / savedCount;
  const averageRating = selectedGames.reduce((sum, game) => sum + game.rating, 0) / savedCount;
  const totalVisibleRevenue = selectedGames.reduce((sum, game) => sum + game.revenue, 0);
  const tagCounts = new Map<string, number>();
  for (const game of selectedGames) {
    for (const tag of game.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);
  const strongestGame = selectedGames.reduce((best, game) => (game.rating > best.rating ? game : best), selectedGames[0]);
  const tagPhrase = topTags.slice(0, 3).join(", ") || "mixed genres";

  return {
    userId,
    savedCount,
    averagePrice: Number(averagePrice.toFixed(2)),
    averageRating: Number(averageRating.toFixed(2)),
    totalVisibleRevenue,
    topTags,
    strategy: {
      title: "Collection Intelligence",
      caption: "Demo rules",
      body: `This collection groups ${tagPhrase}. Compare gameplay and tags; market demand has not been established.`,
      bullets: [
        `Saved games: ${savedCount}.`,
        `Average price: ${formatAveragePrice(averagePrice)}.`,
        `Catalog revenue total: $${formatCompact(totalVisibleRevenue)}.`,
        `Top tags: ${tagPhrase}.`,
      ],
    },
    source: "mock",
  };
}

function formatAveragePrice(value: number) {
  return value === 0 ? "Free" : `$${value.toFixed(2)}`;
}
