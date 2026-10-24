import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import * as catalog from "../src/services/catalog";
import type { SearchResponse } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));

const candidates = ["The Planet Crafter", "Hades II", "Assetto Corsa", "ELDEN RING", "Plague Inc: Evolved", "Titanfall 2"];
const emptyResponse: SearchResponse = {
  intent: { titleQuery: "nonexistent", maxPrice: null, minRating: 0, hasReviews: false, tags: [], mode: "developer",
    sortBy: null, sortDirection: "asc", limit: null, offset: 0 },
  games: [], source: "mock",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo#developer");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function enterResearch() {
  const view = render(<App />);
  await screen.findByRole("button", { name: /^The Planet Crafter / });
  return view;
}

function cardTitles(container: HTMLElement) {
  return [...container.querySelectorAll(".game-card h3")].map((card) => card.textContent);
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Search catalog", exact: true }));
}

function submitSearch(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Research the catalog", exact: true }), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /^(Explore catalog|Searching…)$/ }));
}

describe("developer overview before research", () => {
  it("starts with the whole catalog overview and review-ranked candidates without searching or analyzing an arbitrary game", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const details = vi.spyOn(catalog, "getGameDetail");
    const insights = vi.spyOn(catalog, "getGameInsights");
    const { container } = await enterResearch();

    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    const overview = screen.getByRole("region", { name: "Catalog overview", exact: true });
    expect([...overview.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["80", "75", "US$24.85", "4.4 / 5"]);
    expect(overview.textContent).toContain("Sample catalog");
    expect(cardTitles(container)).toEqual(candidates);
    expect(container.querySelectorAll(".game-card img")).toHaveLength(6);
    expect(screen.queryByRole("textbox", { name: "Research the catalog" })).toBeNull();
    expect(screen.queryByDisplayValue(/exploration games for developer/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Research metrics" })).toBeNull();
    expect(search).not.toHaveBeenCalled();
    expect(details).not.toHaveBeenCalled();
    expect(insights).not.toHaveBeenCalled();
  });

  it("shows an empty catalog without invented averages, candidates, or game analysis", async () => {
    vi.spyOn(catalog, "getCatalog").mockResolvedValueOnce([]);
    const insights = vi.spyOn(catalog, "getGameInsights");
    const { container } = render(<App />);
    await waitFor(() => expect(screen.queryByText("Loading game catalog…")).toBeNull());

    const overview = screen.getByRole("region", { name: "Catalog overview", exact: true });
    expect([...overview.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["0", "0", "—", "—"]);
    expect(cardTitles(container)).toEqual([]);
    expect(screen.queryByRole("button", { name: /^Research Multiplayer$/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
    expect(insights).not.toHaveBeenCalled();
  });

  it("analyzes and saves the chosen research candidate without submitting a search", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const insights = vi.spyOn(catalog, "getGameInsights");
    const save = vi.spyOn(catalog, "saveGame");
    const { container } = await enterResearch();

    fireEvent.click(screen.getByRole("button", { name: /^The Planet Crafter / }));
    await screen.findByRole("heading", { level: 2, name: "The Planet Crafter" });
    await waitFor(() => expect(container.querySelector(".insight-verdict")?.textContent).toContain("Miju Games"));
    expect(screen.getByRole("heading", { name: "Catalog analysis", exact: true })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Research metrics" }).textContent).toContain("Estimated ownership");
    expect(screen.getByRole("region", { name: "Research metrics" }).textContent).toContain("Demonstration metrics");
    expect(insights).toHaveBeenCalledTimes(1);
    expect(insights).toHaveBeenCalledWith(expect.objectContaining({ name: "The Planet Crafter" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Save" }));
    await screen.findByRole("button", { name: "Saved (1)", exact: true });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "The Planet Crafter" }), expect.any(Array), "demo-user", 1);
    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(candidates);
    expect(search).not.toHaveBeenCalled();
  });

  it("opens blank search on demand and returns a blank submission to an unselected overview", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterResearch();
    fireEvent.click(screen.getByRole("button", { name: /^Hades II / }));
    await screen.findByRole("heading", { level: 2, name: "Hades II" });
    openSearch();

    expect((screen.getByRole("textbox", { name: "Research the catalog" }) as HTMLTextAreaElement).value).toBe("");
    expect(cardTitles(container)).toEqual(candidates);
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
    submitSearch("   ");
    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Research the catalog" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
    expect(cardTitles(container)).toEqual(candidates);
    expect(search).not.toHaveBeenCalled();
  });

  it("returns from search and empty filtered results to the full overview with neutral filters", async () => {
    const { container } = await enterResearch();
    openSearch();
    submitSearch("Celeste");
    await screen.findByRole("heading", { level: 2, name: "Celeste" });
    expect(cardTitles(container)).toEqual(["Celeste"]);
    expect(screen.getByRole("heading", { name: "Catalog analysis", exact: true })).toBeTruthy();
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByText("No games match these filters.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview", exact: true }));
    expect(cardTitles(container)).toEqual(candidates);
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
    expect(screen.queryByText("No games match these filters.")).toBeNull();
    openSearch();
    expect((screen.getByRole("textbox", { name: "Research the catalog" }) as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    expect((screen.getByRole("combobox", { name: "Tag Focus" }) as HTMLSelectElement).value).toBe("");
    expect(screen.getByText("Any price", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
  });

  it("drills a catalog tag into all matching games without an AI search", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterResearch();
    fireEvent.click(screen.getByRole("button", { name: "Research Multiplayer", exact: true }));

    // Aimlabs is outside the six overview candidates, so this checks the drilldown's full-catalog scope.
    expect(cardTitles(container)).toContain("Aimlabs");
    expect(cardTitles(container)).toContain("Core Keeper");
    expect(cardTitles(container)).not.toContain("Hades");
    expect(screen.getByRole("list", { name: "Current search filters" }).textContent).toContain("Multiplayer");
    expect((screen.getByRole("textbox", { name: "Research the catalog" }) as HTMLTextAreaElement).value).toBe("");
    expect(search).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview", exact: true }));
    expect(cardTitles(container)).toEqual(candidates);
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
  });

  it.each(["success", "error"])("ignores a pending search %s after returning to the overview", async (outcome) => {
    let resolve!: (value: SearchResponse) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<SearchResponse>((yes, no) => { resolve = yes; reject = no; });
    const search = vi.spyOn(catalog, "searchCatalog").mockReturnValueOnce(pending);
    const { container } = await enterResearch();
    openSearch();
    submitSearch("nonexistent");
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to overview", exact: true }));
    await act(async () => {
      if (outcome === "success") resolve(emptyResponse);
      else reject(new Error("Stale research failure"));
    });
    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(candidates);
    expect(screen.queryByText("No games match these filters.")).toBeNull();
    expect(screen.queryByText("Stale research failure")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Research the catalog" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
  });

  it("translates the overview and research controls without losing selection or requesting new insights", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const insights = vi.spyOn(catalog, "getGameInsights");
    const { container } = await enterResearch();
    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    expect(screen.getByRole("heading", { name: /^研究\s*概览$/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "目录概况", exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "研究多人", exact: true })).toBeTruthy();
    expect(insights).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Hades II / }));
    await screen.findByRole("heading", { level: 2, name: "Hades II" });
    await waitFor(() => expect(insights).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "搜索游戏库", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "搜索研究对象" }), { target: { value: "Hades II under 29.99" } });
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    expect((screen.getByRole("textbox", { name: "Research the catalog" }) as HTMLTextAreaElement).value).toBe("Hades II under 29.99");
    expect(screen.getByRole("heading", { level: 2, name: "Hades II" })).toBeTruthy();
    expect(cardTitles(container)).toEqual(candidates);
    expect(insights).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to overview", exact: true }));
    expect(screen.getByRole("button", { name: "Search catalog", exact: true })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Game details" })).toBeNull();
  });
});
