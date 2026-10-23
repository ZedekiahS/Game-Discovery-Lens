import { useEffect, useRef, useState } from "react";
import { getGameDetail, getGameInsights } from "../services/catalog";
import type { Game, GameInsights } from "../types";

// Loads details and AI insights for one selection; late results stay with that selection.
export function useGameDetails(selectedId: number | null, catalog: Game[], preview?: Game) {
  const [selectedDetail, setSelectedDetail] = useState<Game | null>(null);
  const [insights, setInsights] = useState<GameInsights | null>(null);
  const [detailError, setDetailError] = useState("");
  const [insightsError, setInsightsError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refreshRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = refreshRequested.current;
    refreshRequested.current = false;
    setSelectedDetail(null);
    setInsights(null);
    setDetailError("");
    setInsightsError("");
    setDetailLoading(selectedId !== null);
    if (selectedId === null) return;

    async function load() {
      let game: Game | null;
      try {
        game = refresh ? await getGameDetail(selectedId!, catalog, true) : await getGameDetail(selectedId!, catalog);
        if (cancelled) return;
        setSelectedDetail(game);
        if (!game) {
          setDetailError("This game is unavailable.");
          setDetailLoading(false);
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setDetailError(message(error, "Unable to load game details."));
          setDetailLoading(false);
        }
        return;
      }
      try {
        const result = refresh ? await getGameInsights(game, true) : await getGameInsights(game);
        if (!cancelled) setInsights(result);
      } catch (error) {
        if (!cancelled) setInsightsError(message(error, "Unable to load game intelligence."));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [catalog, selectedId, revision]);

  const selectedGame = selectedDetail?.id === selectedId ? selectedDetail : preview;
  const visibleInsights = insights?.gameId === selectedGame?.id ? insights : null;
  return {
    selectedGame, visibleInsights, detailError, insightsError, detailLoading,
    retryDetails: () => { refreshRequested.current = true; setRevision((value) => value + 1); },
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
