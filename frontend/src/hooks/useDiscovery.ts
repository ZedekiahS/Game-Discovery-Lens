import { useEffect, useMemo, useRef, useState } from "react";
import { getCatalog, searchCatalog } from "../services/catalog";
import { DATA_MODE } from "../services/runtime";
import { filterGames } from "../lib/search";
import { recommendGames } from "../lib/recommendations";
import { researchGames } from "../lib/researchOverview";
import type { Game, SearchIntent, SearchResponse } from "../types";

export const exampleQueries = [
  "Find the second most expensive FPS game",
  "Celeste",
  "Find cheap multiplayer survival games with good reviews",
  "Show highly rated story rich games under 25 dollars",
  "Find exploration games for developer catalog analysis",
];

const initialIntent: SearchIntent = {
  titleQuery: null, maxPrice: null, minRating: 0, hasReviews: false, tags: [], mode: "player",
  sortBy: null, sortDirection: "asc", limit: null, offset: 0,
};

// Owns catalog loading, search ordering, filters, and the selected result together.
export function useDiscovery(view: SearchIntent["mode"] = "player") {
  const [defaults] = useState(() => ({ ...initialIntent, mode: view }));
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [isBrowsing, setIsBrowsing] = useState(true);
  const [intent, setIntent] = useState<SearchIntent>(defaults);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Game[] | null>(null);
  const [searchSource, setSearchSource] = useState<SearchResponse["source"]>(DATA_MODE === "demo" ? "mock" : "rules");
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const searchSequence = useRef(0);
  const pendingSearch = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError("");
    getCatalog().then((items) => {
      if (cancelled) return;
      setCatalog(items);
      setSelectedId((current) => items.some((game) => game.id === current) ? current : view === "player" ? recommendGames(items)[0]?.id ?? null : null);
    }).catch((error) => {
      if (!cancelled) setCatalogError(message(error, "Unable to load the catalog."));
    }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [catalogRevision, defaults, view]);

  useEffect(() => () => { ++searchSequence.current; }, []);

  const tags = useMemo(() => [...new Set(catalog.flatMap((game) => game.tags))].sort(), [catalog]);
  const priceCeiling = Math.max(70, intent.maxPrice ?? 0, ...catalog.map((game) => game.price));
  const filteredGames = useMemo(() => isBrowsing ? view === "player" ? recommendGames(catalog) : researchGames(catalog) : searchResults ?? filterGames(catalog, intent), [catalog, intent, isBrowsing, searchResults, view]);
  const selectedPreview = catalog.find((game) => game.id === selectedId) ?? searchResults?.find((game) => game.id === selectedId);

  async function runSearch(nextQuery = query) {
    const submittedQuery = nextQuery.trim();
    if (!submittedQuery) {
      resetBrowse();
      return;
    }
    if (catalogLoading || pendingSearch.current === submittedQuery) return;
    const request = ++searchSequence.current;
    pendingSearch.current = submittedQuery;
    setIsBrowsing(false);
    setSearchLoading(true);
    setSearchError("");
    try {
      const response = await searchCatalog(submittedQuery, tags, catalog);
      if (request !== searchSequence.current) return;
      setIntent(response.intent);
      setSearchResults(response.games);
      setSearchSource(response.source);
      setSelectedId(response.games[0]?.id ?? null);
    } catch (error) {
      if (request === searchSequence.current) setSearchError(message(error, "Unable to run search."));
    } finally {
      if (request === searchSequence.current) {
        pendingSearch.current = null;
        setSearchLoading(false);
      }
    }
  }

  function updateIntent(partial: Partial<SearchIntent>) {
    ++searchSequence.current;
    pendingSearch.current = null;
    setSearchLoading(false);
    setSearchError("");
    setIsBrowsing(false);
    const nextIntent = { ...intent, ...partial };
    const nextGames = filterGames(catalog, nextIntent);
    setIntent(nextIntent);
    setSelectedId(nextGames.some((game) => game.id === selectedId) ? selectedId : nextGames[0]?.id ?? null);
    setSearchResults(null);
    setSearchSource(DATA_MODE === "demo" ? "mock" : "rules");
  }

  function resetBrowse() {
    ++searchSequence.current;
    pendingSearch.current = null;
    setQuery("");
    setIntent(defaults);
    setSearchResults(null);
    setSearchSource(DATA_MODE === "demo" ? "mock" : "rules");
    setSearchError("");
    setSearchLoading(false);
    setSelectedId(view === "player" ? recommendGames(catalog)[0]?.id ?? null : null);
    setIsBrowsing(true);
  }

  return {
    catalog, catalogLoading, catalogError, query, setQuery, intent, tags, priceCeiling,
    filteredGames, selectedId, selectedPreview, selectGame: (id: number | null) => setSelectedId(id), view,
    searchSource, searchError, searchLoading, runSearch, updateIntent, isBrowsing, resetBrowse,
    retryCatalog: () => setCatalogRevision((value) => value + 1),
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
