import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import * as catalog from "../src/services/catalog";
import fixture from "../../tests/fixtures/search-contract.json";
import type { Game, GameInsights, SearchIntent, SearchResponse } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));
vi.mock("../src/services/catalog", () => ({
  getCatalog: vi.fn(), getCollections: vi.fn(), getSavedGames: vi.fn(), getShortlistInsights: vi.fn(),
  getGameDetail: vi.fn(), getGameInsights: vi.fn(), searchCatalog: vi.fn(),
  createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(),
  saveGame: vi.fn(), removeSavedGame: vi.fn(), clearSavedGames: vi.fn(),
}));

const games: Game[] = fixture.games;
const celeste = games[0];
const budget = games[4];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function result(game: Game | null): SearchResponse {
  const intent = {
    titleQuery: game?.name.toLowerCase() ?? "nonexistent", maxPrice: null, minRating: 0,
    hasReviews: false, tags: [], mode: "player", sortBy: null, sortDirection: "asc", limit: null, offset: 0,
  } as SearchIntent;
  return { intent, games: game ? [game] : [], source: "mock" };
}
function insights(game: Game): GameInsights {
  const panel = { title: "Review Intelligence", caption: "Demo rules", body: "Evidence for " + game.name, bullets: [] };
  return { gameId: game.id, signal: "Watch", source: "mock", reviewIntelligence: panel,
    playerRecommendation: { ...panel, title: "Player Recommendation" },
    developerOpportunity: { ...panel, title: "Developer Copilot" } };
}
function search(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Search games" }), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /^(Run Search|Searching…)$/ }));
}
async function openApp() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Run Search" }).hasAttribute("disabled")).toBe(false));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/?mode=demo#player");
  vi.mocked(catalog.getCatalog).mockResolvedValue(games);
  vi.mocked(catalog.getCollections).mockResolvedValue([{ id: 1, userId: "demo-user", name: "Default Shortlist", description: "", createdAt: "2026-01-01" }]);
  vi.mocked(catalog.getSavedGames).mockResolvedValue([]);
  vi.mocked(catalog.getShortlistInsights).mockResolvedValue({ userId: "demo-user", savedCount: 0, averagePrice: 0,
    averageRating: 0, totalVisibleRevenue: 0, topTags: [], source: "mock",
    strategy: { title: "", caption: "", body: "Empty collection", bullets: [] } });
  vi.mocked(catalog.getGameDetail).mockImplementation(async (id) => games.find((game) => game.id === id) ?? null);
  vi.mocked(catalog.getGameInsights).mockImplementation(async (game) => insights(game));
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("search results and selection", () => {
  it("does not resend an identical pending search", async () => {
    const pending = deferred<SearchResponse>();
    vi.mocked(catalog.searchCatalog).mockReturnValue(pending.promise);
    await openApp();
    search("Celeste");
    search("Celeste");
    expect(catalog.searchCatalog).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(result(celeste)); });
    expect(screen.getByRole("list", { name: "Current search filters" }).textContent).toContain("Any price");
  });

  it("accepts a newer search while the previous request is pending and ignores the old success", async () => {
    const first = deferred<SearchResponse>();
    const second = deferred<SearchResponse>();
    vi.mocked(catalog.searchCatalog).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await openApp();
    search("Celeste");
    search("Budget FPS");
    expect(catalog.searchCatalog).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve(result(budget)); });
    await screen.findByRole("heading", { level: 2, name: budget.name });
    await act(async () => { first.resolve(result(celeste)); });
    expect(screen.queryByRole("heading", { level: 2, name: celeste.name })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: budget.name })).toBeTruthy();
  });

  it("ignores a stale error after a newer search succeeds", async () => {
    const first = deferred<SearchResponse>();
    vi.mocked(catalog.searchCatalog).mockReturnValueOnce(first.promise).mockResolvedValueOnce(result(celeste));
    await openApp();
    search("old query");
    search("Celeste");
    expect(catalog.searchCatalog).toHaveBeenCalledTimes(2);
    await screen.findByRole("heading", { level: 2, name: celeste.name });
    await act(async () => { first.reject(new Error("Old request failed")); });
    expect(screen.queryByText("Old request failed")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: celeste.name })).toBeTruthy();
  });

  it("clears details when a filter removes the selected title", async () => {
    vi.mocked(catalog.searchCatalog).mockResolvedValue(result(celeste));
    await openApp();
    search("Celeste");
    await screen.findByRole("heading", { level: 2, name: celeste.name });
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByText("No games match these filters.")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: celeste.name })).toBeNull();
    expect(screen.queryByText("Evidence for Celeste")).toBeNull();
  });

  it("shows empty results without stale details or a stale AI insight", async () => {
    const lateInsight = deferred<GameInsights>();
    vi.mocked(catalog.getGameInsights).mockImplementation((game) => game.id === celeste.id ? lateInsight.promise : Promise.resolve(insights(game)));
    vi.mocked(catalog.searchCatalog).mockResolvedValueOnce(result(celeste)).mockResolvedValueOnce(result(null));
    await openApp();
    search("Celeste");
    await screen.findByRole("heading", { level: 2, name: celeste.name });
    await waitFor(() => expect(catalog.getGameInsights).toHaveBeenCalledWith(celeste));
    search("nonexistent");
    await screen.findByText("No games match these filters.");
    await act(async () => { lateInsight.resolve(insights(celeste)); });
    expect(screen.queryByRole("heading", { level: 2, name: celeste.name })).toBeNull();
    expect(screen.queryByText("Evidence for Celeste")).toBeNull();
  });

  it("keeps a newer filter change when a pending search returns", async () => {
    const pending = deferred<SearchResponse>();
    vi.mocked(catalog.searchCatalog).mockReturnValue(pending.promise);
    await openApp();
    search("Celeste");
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    await act(async () => { pending.resolve(result(celeste)); });
    expect(screen.getByText("No games match these filters.")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: celeste.name })).toBeNull();
  });

  it("keeps advanced controls folded while primary search and active conditions remain available", async () => {
    vi.mocked(catalog.searchCatalog).mockResolvedValue(result(celeste));
    await openApp();
    const filters = screen.getByText("Filters", { selector: "summary" });
    expect(filters.closest("details")?.open).toBe(false);
    expect(screen.queryByText("How this search works", { selector: "summary" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Celeste" }));
    await screen.findByRole("heading", { level: 2, name: celeste.name });
    expect(screen.queryByText("How this search works", { selector: "summary" })).toBeNull();
    expect(document.querySelector("pre.intent-box")).toBeNull();
    expect(catalog.searchCatalog).toHaveBeenCalledWith("Celeste", expect.any(Array), games);
    expect(screen.getByRole("list", { name: "Current search filters" }).textContent).toContain("Title: celeste");
    expect(filters.closest("details")?.open).toBe(false);

    fireEvent.click(filters);
    expect(filters.closest("details")?.open).toBe(true);
    expect(screen.getByRole("slider")).toBeTruthy();
  });
});
