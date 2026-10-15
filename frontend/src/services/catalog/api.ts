import type { Game, GameCollection, GameInsights, SavedGame, SearchResponse, ShortlistInsights } from "../../types";
import { requestApi } from "../http";
import { requireAuthHeaders } from "../users";
import type { CatalogService } from "./contract";

export const apiCatalog: CatalogService = {
  async getCatalog() {
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
    return requestApi<SavedGame[]>(`/saved-games${buildCollectionQuery(collectionId)}`, {
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

  async getGameDetail(gameId) {
    return requestApi<Game>(`/games/${gameId}`);
  },

  async getGameInsights(game) {
    return requestApi<GameInsights>(`/games/${game.id}/insights`);
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
