import type { Game, GameCollection, GameInsights, SavedGame, SearchResponse, ShortlistInsights } from "../../types";
import { requestApi } from "../http";
import { requestAccount } from "../users";
import type { CatalogService } from "./contract";

// Only public game resources are cached. Account data continues to be loaded per session.
const gameReads = new Map<string, { expires: number; request: Promise<unknown> }>();
function readGame<T>(path: string, refresh = false): Promise<T> {
  const cached = gameReads.get(path);
  if (!refresh && cached && cached.expires > Date.now()) return cached.request as Promise<T>;
  const request = requestApi<T>(path).catch((error) => {
    if (gameReads.get(path)?.request === request) gameReads.delete(path);
    throw error;
  });
  gameReads.set(path, { request, expires: Date.now() + 60_000 });
  return request;
}

export const apiCatalog: CatalogService = {
  async getCatalog() {
    gameReads.clear();
    return requestApi<Game[]>("/games");
  },

  async getCollections(userId) {
    return requestAccount<GameCollection[]>("/collections", userId, { headers: {} });
  },

  async createCollection(name, userId, purpose) {
    return requestAccount<GameCollection>("/collections", userId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, purpose }),
    });
  },

  async updateCollection(collectionId, name, userId, purpose) {
    return requestAccount<GameCollection>(`/collections/${collectionId}`, userId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, purpose }),
    });
  },

  async deleteCollection(collectionId, userId) {
    return requestAccount<void>(`/collections/${collectionId}`, userId, {
      method: "DELETE",
      headers: {},
    });
  },

  async getSavedGames(_catalog, userId, collectionId) {
    return requestAccount<SavedGame[]>(`/saved-games${collectionId === "all" ? "?allCollections=true" : buildCollectionQuery(collectionId)}`, userId, {
      headers: {},
    });
  },

  async getShortlistInsights(_savedGames, userId, collectionId) {
    return requestAccount<ShortlistInsights>(`/saved-games/insights${buildCollectionQuery(collectionId)}`, userId, {
      headers: {},
    });
  },

  async saveGame(game, _catalog, userId, collectionId) {
    return requestAccount<SavedGame>("/saved-games", userId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id, collectionId }),
    });
  },

  async removeSavedGame(gameId, userId, collectionId) {
    return requestAccount<void>(`/saved-games/${gameId}${buildCollectionQuery(collectionId)}`, userId, {
      method: "DELETE",
      headers: {},
    });
  },

  async clearSavedGames(userId, collectionId) {
    return requestAccount<void>(`/saved-games${buildCollectionQuery(collectionId)}`, userId, {
      method: "DELETE",
      headers: {},
    });
  },

  async getGameDetail(gameId, _catalog, refresh) {
    return readGame<Game>(`/games/${gameId}`, refresh);
  },

  async getGameInsights(game, refresh) {
    return readGame<GameInsights>(`/games/${game.id}/insights`, refresh);
  },

  async searchCatalog(query) {
    return requestApi<SearchResponse>("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
  },
};

function buildCollectionQuery(collectionId?: number) {
  return collectionId === undefined ? "" : `?${new URLSearchParams({ collectionId: collectionId.toString() })}`;
}
