import { getVerifiedSession, checkSession, isCurrentSession } from "../services/users";
import { useEffect, useRef, useState } from "react";
import type { CollectionPurpose, Game, GameCollection, SavedGame, ShortlistInsights } from "../types";
import * as catalogService from "../services/catalog";

interface CollectionState {
  scope: string;
  loadedCatalog: Game[] | null;
  collections: GameCollection[];
  savedGamesByCollection: Record<number, SavedGame[]>;
  activeCollectionId: number | null;
  shortlistInsights: ShortlistInsights | null;
  insightsError: string;
  loading: boolean;
  busy: boolean;
  error: string;
}

const emptyState = (scope: string): CollectionState => ({
  scope, loadedCatalog: null, collections: [], savedGamesByCollection: {}, activeCollectionId: null,
  shortlistInsights: null, insightsError: "", loading: false, busy: false, error: "",
});

export function useCollections(catalog: Game[], userId: string | null, sessionRevision = 0, purpose?: CollectionPurpose, insightsEnabled = true) {
  const session = getVerifiedSession();
  const scope = `${userId ?? "anonymous"}:${sessionRevision}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const mutation = useRef<symbol | null>(null);
  const needsReload = useRef(false);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState(() => emptyState(scope));
  // Hide previous-account data immediately, before the new effect can run.
  const visible = state.scope === scope ? state : emptyState(scope);
  const loading = userId !== null && (state.scope !== scope || visible.loading || visible.loadedCatalog !== catalog);

  useEffect(() => {
    const request = ++generation.current;
    mutation.current = null;
    needsReload.current = true;
    const current = () => currentScope.current === scope && generation.current === request && isCurrentSession(session);
    setState({ ...emptyState(scope), loading: userId !== null });
    if (userId === null) return;

    async function load() {
      try {
        const collections = await catalogService.getCollections(userId!);
        if (!current()) return;
        const saved = await catalogService.getSavedGames(catalog, userId!, "all");
        const entries = collections.map((collection) => [collection.id, saved.filter((item) => item.collectionId === collection.id)]);
        if (!current()) return;
        setState({
          // Only a successful read reconciles an uncertain write.
          ...emptyState(scope), loadedCatalog: catalog, collections, savedGamesByCollection: Object.fromEntries(entries),
          activeCollectionId: collections[0]?.id ?? null,
        });
        needsReload.current = false;
      } catch (error) {
        if (current()) setState({ ...emptyState(scope), loadedCatalog: catalog, error: message(error, "Unable to load collections.") });
      }
    }
    void load();
    return () => { ++generation.current; };
  }, [scope, catalog, userId, reload]);

  useEffect(() => {
    const request = generation.current;
    let cancelled = false;
    const collectionId = visible.activeCollectionId;
    // Wait for compound create-and-save operations to settle before deriving insights.
    // Invalidate at the data change itself, not with a synchronous write in this effect.
    if (!insightsEnabled || userId === null || collectionId === null || loading || visible.busy || visible.error) return;
    catalogService.getShortlistInsights(visible.savedGamesByCollection[collectionId] ?? [], userId, collectionId)
      .then((insights) => {
        if (!cancelled && currentScope.current === scope && generation.current === request) {
          setState((previous) => ({ ...previous, shortlistInsights: insights }));
        }
      }).catch((error) => {
        if (!cancelled && currentScope.current === scope && generation.current === request) {
          setState((previous) => ({ ...previous, insightsError: message(error, "Unable to load collection intelligence.") }));
        }
      });
    return () => { cancelled = true; };
  }, [scope, userId, loading, visible.busy, visible.error, visible.activeCollectionId, visible.savedGamesByCollection, insightsEnabled]);

  async function change<T>(
    action: (current: () => boolean) => Promise<T | null>,
    apply: (previous: CollectionState, result: T) => CollectionState,
  ): Promise<T | null> {
    if (userId === null || loading || needsReload.current || visible.error || mutation.current !== null || state.scope !== scope) return null;
    if (!checkSession(session)) return null;
    const request = generation.current;
    const operation = Symbol();
    mutation.current = operation;
    const current = () => currentScope.current === scope && generation.current === request && isCurrentSession(session);
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const result = await action(current);
      if (!current() || result === null) return null;
      setState((previous) => previous.scope === scope ? apply(previous, result) : previous);
      return result;
    } catch (error) {
      if (current()) {
        needsReload.current = true;
        setState((previous) => ({
          ...previous, error: `The change could not be confirmed. ${message(error, "Check your connection.")} Reload collections before retrying.`,
        }));
      }
      return null;
    } finally {
      if (mutation.current === operation) mutation.current = null;
      if (current()) setState((previous) => ({ ...previous, busy: false }));
    }
  }

  function withSaved(previous: CollectionState, collectionId: number, items: SavedGame[]): CollectionState {
    return { ...previous, savedGamesByCollection: { ...previous.savedGamesByCollection, [collectionId]: items },
      shortlistInsights: null, insightsError: "" };
  }

  async function save(game: Game, collection: GameCollection) {
    return (await change(() => catalogService.saveGame(game, catalog, userId!, collection.id), (previous, saved) => ({
      ...withSaved(previous, collection.id, [saved, ...(previous.savedGamesByCollection[collection.id] ?? [])
        .filter((item) => item.gameId !== saved.gameId)]), activeCollectionId: collection.id,
    }))) !== null;
  }

  async function remove(gameId: number, collectionId: number) {
    return (await change(async () => {
      await catalogService.removeSavedGame(gameId, userId!, collectionId);
      return true;
    }, (previous) => withSaved(previous, collectionId,
      (previous.savedGamesByCollection[collectionId] ?? []).filter((item) => item.gameId !== gameId)))) !== null;
  }

  async function clear(collectionId: number) {
    return (await change(async () => {
      await catalogService.clearSavedGames(userId!, collectionId);
      return true;
    }, (previous) => withSaved(previous, collectionId, []))) !== null;
  }

  function withCollection(previous: CollectionState, collection: GameCollection): CollectionState {
    const collections = previous.collections.some((item) => item.id === collection.id)
      ? previous.collections.map((item) => item.id === collection.id ? collection : item)
      : [...previous.collections, collection];
    return { ...previous, collections, activeCollectionId: collection.id, shortlistInsights: null, insightsError: "" };
  }

  async function create(name: string) {
    return change(() => catalogService.createCollection(name.trim(), userId!, purpose), withCollection);
  }

  async function rename(collectionId: number, name: string) {
    return (await change(() => catalogService.updateCollection(collectionId, name.trim(), userId!), withCollection)) !== null;
  }

  async function deleteCollection(collectionId: number) {
    return (await change(async () => {
      await catalogService.deleteCollection(collectionId, userId!);
      return true;
    }, (previous) => {
      const collections = previous.collections.filter((item) => item.id !== collectionId);
      const remaining = { ...previous.savedGamesByCollection };
      delete remaining[collectionId];
      return {
        ...previous, collections, savedGamesByCollection: remaining, shortlistInsights: null, insightsError: "",
        activeCollectionId: previous.activeCollectionId === collectionId ? collections[0]?.id ?? null : previous.activeCollectionId,
      };
    })) !== null;
  }

  async function createAndSave(name: string, game: Game) {
    return (await change(async (current) => {
      const collection = await catalogService.createCollection(name.trim(), userId!, purpose);
      if (!current()) return null;
      // The collection already exists even if the following save fails.
      setState((previous) => withCollection(previous, collection));
      const saved = await catalogService.saveGame(game, catalog, userId!, collection.id);
      return { collection, saved };
    }, (previous, { collection, saved }) => withSaved(previous, collection.id,
      [saved, ...(previous.savedGamesByCollection[collection.id] ?? []).filter((item) => item.gameId !== saved.gameId)]))) !== null;
  }

  return {
    ...visible, loading, save, remove, clear, create, rename, deleteCollection, createAndSave,
    setPurpose: (collection: GameCollection, next: CollectionPurpose) => change(
      () => catalogService.updateCollection(collection.id, collection.name, userId!, next), withCollection,
    ),
    setActiveCollectionId: (id: number) => setState((previous) => previous.scope === scope && previous.activeCollectionId !== id
      ? { ...previous, activeCollectionId: id, shortlistInsights: null, insightsError: "" } : previous),
    retry: () => { if (mutation.current === null) { needsReload.current = true; setReload((value) => value + 1); } },
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
