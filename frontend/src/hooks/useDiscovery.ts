import { useEffect, useMemo, useRef, useState } from "react";
import { getCatalog, searchCatalog } from "../services/catalog";
import { DATA_MODE } from "../services/runtime";
import { filterGames } from "../lib/search";
import { availableTagChoices } from '../lib/tagSemantics';
import { recommendGames } from "../lib/recommendations";
import { researchGames } from "../lib/researchOverview";
import type { Game, SearchIntent, SearchResponse } from "../types";
import { defaultIntent, readDiscoveryLocation, writeDiscoveryLocation } from '../lib/discoveryLocation';

export const exampleQueries = [
  "Find the second most expensive FPS game",
  "Celeste",
  "Find cheap multiplayer survival games with good reviews",
  "Show highly rated story rich games under 25 dollars",
  "Find exploration games for developer catalog analysis",
];

// Owns catalog loading, search ordering, filters, and the selected result together.
export function useDiscovery(view: SearchIntent["mode"] = "player") {
  const [defaults] = useState(() => defaultIntent(view));
  const [restored] = useState(() => readDiscoveryLocation(view));
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [query, setQuery] = useState(restored?.query ?? "");
  const [appliedQuery, setAppliedQuery] = useState(restored?.query ?? '');
  const [isBrowsing, setIsBrowsing] = useState(!restored);
  const [intent, setIntent] = useState<SearchIntent>(restored?.intent ?? defaults);
  const [selectedId, setSelectedId] = useState<number | null>(restored?.selectedId ?? null);
  const [searchResults, setSearchResults] = useState<Game[] | null>(null);
  const [searchSource, setSearchSource] = useState<SearchResponse["source"]>(DATA_MODE === "demo" ? "mock" : "rules");
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [conditionsEdited, setConditionsEdited] = useState(restored?.edited ?? false);
  const searchSequence = useRef(0);
  const pendingSearch = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError("");
    getCatalog().then((items) => {
      if (cancelled) return;
      setCatalog(items);
      const saved = readDiscoveryLocation(view);
      const candidates = saved ? filterGames(items, saved.intent) : items;
      setSelectedId((current) => candidates.some((game) => game.id === current) ? current : saved ? candidates[0]?.id ?? null : view === "player" ? recommendGames(items)[0]?.id ?? null : null);
    }).catch((error) => {
      if (!cancelled) setCatalogError(message(error, "Unable to load the catalog."));
    }).finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [catalogRevision, defaults, view]);

  useEffect(() => () => { ++searchSequence.current; }, []);
  useEffect(() => {
    const restore = () => {
      const state = readDiscoveryLocation(view);
      ++searchSequence.current;
      pendingSearch.current = null;
      setQuery(state?.query ?? ''); setAppliedQuery(state?.query ?? ''); setIntent(state?.intent ?? defaults);
      setSelectedId(state?.selectedId ?? null); setIsBrowsing(!state);
      setSearchResults(null); setSearchError(''); setSearchLoading(false);
      setConditionsEdited(state?.edited ?? false);
      setSearchSource(DATA_MODE === 'demo' ? 'mock' : 'rules');
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [view, defaults]);

  const tags = useMemo(() => availableTagChoices(catalog.flatMap((game) => game.tags)), [catalog]);
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
      setAppliedQuery(submittedQuery);
      setConditionsEdited(false);
      setSearchResults(response.games);
      setSearchSource(response.source);
      setSelectedId(response.games[0]?.id ?? null);
      writeDiscoveryLocation(view, { query: submittedQuery, intent: response.intent, selectedId: response.games[0]?.id ?? null, edited: false });
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
    setConditionsEdited(true);
    const nextIntent = { ...intent, ...partial };
    const nextGames = filterGames(catalog, nextIntent);
    setIntent(nextIntent);
    setSelectedId(nextGames.some((game) => game.id === selectedId) ? selectedId : nextGames[0]?.id ?? null);
    setSearchResults(null);
    setSearchSource(DATA_MODE === "demo" ? "mock" : "rules");
    writeDiscoveryLocation(view, { query: appliedQuery, intent: nextIntent, selectedId: nextGames.some(game => game.id === selectedId) ? selectedId : nextGames[0]?.id ?? null, edited: true }, !isBrowsing);
  }

  function resetBrowse() {
    ++searchSequence.current;
    pendingSearch.current = null;
    setQuery("");
    setAppliedQuery('');
    setIntent(defaults);
    setSearchResults(null);
    setSearchSource(DATA_MODE === "demo" ? "mock" : "rules");
    setSearchError("");
    setSearchLoading(false);
    setSelectedId(view === "player" ? recommendGames(catalog)[0]?.id ?? null : null);
    setIsBrowsing(true);
    setConditionsEdited(false);
    writeDiscoveryLocation(view, null);
  }

  return {
    catalog, catalogLoading, catalogError, query, setQuery, intent, tags, priceCeiling,
    filteredGames, selectedId, selectedPreview, selectGame: (id: number | null) => {
      setSelectedId(id);
      if (!isBrowsing) writeDiscoveryLocation(view, { query: appliedQuery, intent, selectedId: id, edited: conditionsEdited });
    }, view,
    searchSource, searchError, searchLoading, runSearch, updateIntent, isBrowsing, resetBrowse, conditionsEdited,
    clearFilters: () => updateIntent({ ...defaults, excludedTags: [] }),
    retryCatalog: () => setCatalogRevision((value) => value + 1),
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
