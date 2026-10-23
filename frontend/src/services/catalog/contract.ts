import type { CollectionPurpose, Game, GameCollection, GameInsights, SavedGame, SearchResponse, ShortlistInsights } from "../../types";

export interface CatalogService {
  getCatalog(): Promise<Game[]>;
  getCollections(userId: string): Promise<GameCollection[]>;
  createCollection(name: string, userId: string, purpose?: CollectionPurpose): Promise<GameCollection>;
  updateCollection(collectionId: number, name: string, userId: string, purpose?: CollectionPurpose): Promise<GameCollection>;
  deleteCollection(collectionId: number, userId: string): Promise<void>;
  getSavedGames(catalog: Game[], userId: string, collectionId?: number | "all"): Promise<SavedGame[]>;
  getShortlistInsights(savedGames: SavedGame[], userId: string, collectionId?: number): Promise<ShortlistInsights>;
  saveGame(game: Game, catalog: Game[], userId: string, collectionId?: number): Promise<SavedGame>;
  removeSavedGame(gameId: number, userId: string, collectionId?: number): Promise<void>;
  clearSavedGames(userId: string, collectionId?: number): Promise<void>;
  getGameDetail(gameId: number, catalog: Game[], refresh?: boolean): Promise<Game | null>;
  getGameInsights(game: Game, refresh?: boolean): Promise<GameInsights>;
  searchCatalog(query: string, availableTags: string[], catalog: Game[]): Promise<SearchResponse>;
}
