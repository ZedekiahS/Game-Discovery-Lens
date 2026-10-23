import type { Game, GameCollection, GameInsights, SavedGame, SearchResponse, ShortlistInsights } from "../../types";
import { requestApi } from "../http";
import { requireAuthHeaders } from "../users";
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

  async getCollections() {
    return requestApi<GameCollection[]>("/collections", { headers: requireAuthHeaders() });
  },

  async createCollection(name, _userId, purpose) {
    return requestApi<GameCollection>("/collections", {
      method: "POST",
      headers: buildJsonHeaders(),
      body: JSON.stringify({ name, purpose }),
    });
  },

  async updateCollection(collectionId, name, _userId, purpose) {
    return requestApi<GameCollection>(`/collections/${collectionId}`, {
      method: "PATCH",
      headers: buildJsonHeaders(),
      body: JSON.stringify({ name, purpose }),
    });
  },

  async deleteCollection(collectionId) {
    return requestApi<void>(`/collections/${collectionId}`, {
      method: "DELETE",
      headers: requireAuthHeaders(),
    });
  },

  async getSavedGames(_catalog, _userId, collectionId) {
    return requestApi<SavedGame[]>(`/saved-games${collectionId === "all" ? "?allCollections=true" : buildCollectionQuery(collectionId)}`, {
      headers: requireAuthHeaders(),
    });
  },

  async getShortlistInsights(_savedGames, _userId, collectionId) {
    return requestApi<ShortlistInsights>(`/saved-games/insights${buildCollectionQuery(collectionId)}`, {
      headers: requireAuthHeaders(),
    });
  },

  async saveGame(game, _catalog, _userId, collectionId) {
    return requestApi<SavedGame>("/saved-games", {
      method: "POST",
      headers: buildJsonHeaders(),
      body: JSON.stringify({ gameId: game.id, collectionId }),
    });
  },

  async removeSavedGame(gameId, _userId, collectionId) {
    return requestApi<void>(`/saved-games/${gameId}${buildCollectionQuery(collectionId)}`, {
      method: "DELETE",
      headers: requireAuthHeaders(),
    });
  },

  async clearSavedGames(_userId, collectionId) {
    return requestApi<void>(`/saved-games${buildCollectionQuery(collectionId)}`, {
      method: "DELETE",
      headers: requireAuthHeaders(),
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

function buildJsonHeaders() {
  return requireAuthHeaders({ "Content-Type": "application/json" });
}

function buildCollectionQuery(collectionId?: number) {
  return collectionId === undefined ? "" : `?${new URLSearchParams({ collectionId: collectionId.toString() })}`;
}
