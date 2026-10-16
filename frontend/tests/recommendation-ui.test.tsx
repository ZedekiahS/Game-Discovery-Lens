import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import * as catalog from "../src/services/catalog";
import type { SearchResponse } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));

const recommendations = ["Ready or Not", "Elite Dangerous", "Stardew Valley", "Hollow Knight", "Balatro", "Sun Haven"];
const emptyResponse: SearchResponse = {
  intent: { titleQuery: "nonexistent", maxPrice: null, minRating: 0, hasReviews: false, tags: [], mode: "player",
    sortBy: null, sortDirection: "asc", limit: null, offset: 0 },
  games: [], source: "mock",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo#player");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function enterPlayer() {
  const view = render(<App />);
  await screen.findByRole("heading", { level: 2, name: "Ready or Not" });
  return view;
}

function cardTitles(container: HTMLElement) {
  return [...container.querySelectorAll(".game-card h3")].map((card) => card.textContent);
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
}

function submitSearch(query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Search games", exact: true }), { target: { value: query } });
  fireEvent.click(screen.getByRole("button", { name: /^(Run Search|Searching…)$/ }));
}

describe("player recommendations before search", () => {
  it("opens with varied, illustrated catalog recommendations and no submitted search", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterPlayer();

    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(recommendations);
    expect(container.querySelectorAll(".game-card img")).toHaveLength(6);
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
    expect(screen.queryByDisplayValue(/second most expensive/)).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("lets a player inspect and save a recommendation without running search", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const save = vi.spyOn(catalog, "saveGame");
    const { container } = await enterPlayer();
    fireEvent.click(screen.getByRole("button", { name: /^Hollow Knight / }));
    await screen.findByRole("heading", { level: 2, name: "Hollow Knight" });
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Game details" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false));
    await waitFor(() => expect(container.querySelector(".insight-verdict")?.textContent).toContain("Metroidvania"));
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Save" }));
    await screen.findByRole("button", { name: "Saved (1)", exact: true });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Hollow Knight" }), expect.any(Array), "demo-user", 1);
    expect(screen.getByRole("heading", { level: 2, name: "Hollow Knight" })).toBeTruthy();
    expect(cardTitles(container)).not.toContain("Hollow Knight");
    expect(screen.getByRole("heading", { name: "For you", exact: true })).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it("opens an empty search on demand while keeping recommendations, and treats a blank submission as browsing", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterPlayer();
    openSearch();

    expect((screen.getByRole("textbox", { name: "Search games" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(recommendations);
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
    submitSearch("   ");
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(recommendations);
    expect(search).not.toHaveBeenCalled();
  });

  it("returns from search results and empty results to fresh recommendations and neutral filters", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterPlayer();
    openSearch();
    submitSearch("Celeste");
    await screen.findByRole("heading", { level: 2, name: "Celeste" });
    expect(cardTitles(container)).toEqual(["Celeste"]);
    expect(screen.queryByRole("heading", { name: "Recommended games", exact: true })).toBeNull();

    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByText("No games match these filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    await screen.findByRole("heading", { level: 2, name: "Ready or Not" });
    expect(cardTitles(container)).toEqual(recommendations);
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
    expect(screen.queryByText("No games match these filters.")).toBeNull();

    openSearch();
    expect((screen.getByRole("textbox", { name: "Search games" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("list", { name: "Current search filters" })).toBeNull();
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    expect((screen.getByRole("combobox", { name: "Tag Focus" }) as HTMLSelectElement).value).toBe("");
    expect(screen.getByText("Any price", { selector: "strong" })).toBeTruthy();
    submitSearch("nonexistent");
    await screen.findByText("No games match these filters.");
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    await screen.findByRole("heading", { level: 2, name: "Ready or Not" });
    expect(cardTitles(container)).toEqual(recommendations);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("switches to filter results without an AI search and can return to recommendations", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    const { container } = await enterPlayer();
    openSearch();
    fireEvent.click(screen.getByText("Filters", { selector: "summary" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Tag Focus" }), { target: { value: "FPS" } });
    expect(screen.queryByRole("heading", { name: "Recommended games", exact: true })).toBeNull();
    expect(cardTitles(container)).toContain("Aimlabs");
    expect(cardTitles(container)).not.toContain("Stardew Valley");
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(recommendations);
    expect(search).not.toHaveBeenCalled();
  });

  it.each(["success", "error"])("ignores a pending search %s after returning to recommendations", async (outcome) => {
    let resolve!: (value: SearchResponse) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<SearchResponse>((yes, no) => { resolve = yes; reject = no; });
    const search = vi.spyOn(catalog, "searchCatalog").mockReturnValueOnce(pending);
    const { container } = await enterPlayer();
    openSearch();
    submitSearch("nonexistent");
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    await act(async () => {
      if (outcome === "success") resolve(emptyResponse);
      else reject(new Error("Stale search failure"));
    });
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(cardTitles(container)).toEqual(recommendations);
    expect(screen.queryByText("No games match these filters.")).toBeNull();
    expect(screen.queryByText("Stale search failure")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
  });

  it("keeps recommendation selection and the browse/search controls consistent across languages", async () => {
    const search = vi.spyOn(catalog, "searchCatalog");
    await enterPlayer();
    fireEvent.click(screen.getByRole("button", { name: /^Balatro / }));
    await screen.findByRole("heading", { level: 2, name: "Balatro" });
    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    expect(screen.getByRole("heading", { name: "精选推荐", exact: true })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Balatro" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "搜索游戏", exact: true }));
    expect((screen.getByRole("textbox", { name: "搜索游戏" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "返回推荐", exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    expect(screen.getByRole("button", { name: "Search games", exact: true })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});
