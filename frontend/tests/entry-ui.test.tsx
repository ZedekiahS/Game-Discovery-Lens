import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import * as catalog from "../src/services/catalog";
import type { SearchResponse } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function searchForCeleste() {
  const openSearch = screen.queryByRole("button", { name: /^(Search games|Search catalog)$/ });
  if (openSearch) fireEvent.click(openSearch);
  const submit = await screen.findByRole("button", { name: /^(Run Search|Explore catalog)$/ });
  await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByRole("textbox", { name: /^(Search games|Research the catalog)$/ }), { target: { value: "Celeste" } });
  fireEvent.click(submit);
  await screen.findByRole("heading", { level: 2, name: "Celeste" });
}

describe("audience entry and navigation", () => {
  it.each(["", "#unknown"])("shows the homepage for %s without loading the workspace", async (hash) => {
    window.history.replaceState(null, "", `/?mode=demo${hash}`);
    const getCatalog = vi.spyOn(catalog, "getCatalog");
    const getInsights = vi.spyOn(catalog, "getGameInsights");
    const getCollections = vi.spyOn(catalog, "getCollections");
    render(<App />);

    expect(screen.getByRole("link", { name: "Enter as player" }).getAttribute("href")).toBe("#player");
    expect(screen.getByRole("link", { name: "Enter as developer" }).getAttribute("href")).toBe("#developer");
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
    expect(getCatalog).not.toHaveBeenCalled();
    expect(getInsights).not.toHaveBeenCalled();
    expect(getCollections).not.toHaveBeenCalled();
  });

  it("enters distinct workspaces through links and supports home and browser back navigation", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Enter as developer" }));
    await screen.findByRole("heading", { name: "Research overview", exact: true });
    expect(window.location.hash).toBe("#developer");
    expect(screen.queryByRole("button", { name: "Player", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Developer", exact: true })).toBeNull();

    await searchForCeleste();
    expect(container.querySelector(".insight-verdict")?.textContent).toContain("comparison reference");
    expect(screen.getByText(/Synthetic demonstration metrics/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Research metrics" }).textContent).toContain("Estimated ownership");
    expect(screen.getByRole("region", { name: "Research metrics" }).textContent).toContain("Estimated revenue · USD");
    expect(screen.getByRole("region", { name: "Research metrics" }).textContent).toContain("Demonstration metrics");
    expect(screen.getByRole("link", { name: "Home", exact: true }).getAttribute("href")).toBe("#home");
    fireEvent.click(screen.getByRole("link", { name: "Home", exact: true }));
    await screen.findByRole("link", { name: "Enter as player" });
    fireEvent.click(screen.getByRole("link", { name: "Enter as player" }));
    await screen.findByRole("heading", { name: "Game insights", exact: true });
    await searchForCeleste();
    expect(container.querySelector(".insight-verdict")?.textContent).toContain("Explore this title");
    expect(screen.queryByRole("heading", { name: "Catalog analysis", exact: true })).toBeNull();
    expect(screen.queryByRole("region", { name: "Research metrics" })).toBeNull();

    await act(async () => { window.history.back(); });
    await screen.findByRole("link", { name: "Enter as developer" });
    expect(screen.queryByRole("textbox", { name: "Search games" })).toBeNull();
  });

  it("keeps a deep-linked developer view when search returns a player intent, including after remount", async () => {
    window.history.replaceState(null, "", "/?mode=demo#developer");
    const first = render(<App />);
    await searchForCeleste();
    await screen.findByRole("heading", { name: "Catalog analysis", exact: true });
    expect(window.location.hash).toBe("#developer");
    expect(screen.queryByRole("heading", { name: "Game insights", exact: true })).toBeNull();

    first.unmount();
    render(<App />);
    await screen.findByRole("heading", { name: "Research overview", exact: true });
    expect(screen.queryByRole("region", { name: "Research metrics" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Enter as developer" })).toBeNull();
  });

  it("ignores a pending search from the workspace after the user returns home and chooses another view", async () => {
    window.history.replaceState(null, "", "/?mode=demo#player");
    let resolve!: (value: SearchResponse) => void;
    const pending = new Promise<SearchResponse>((done) => { resolve = done; });
    vi.spyOn(catalog, "searchCatalog").mockReturnValue(pending);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Search" }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByRole("textbox", { name: "Search games" }), { target: { value: "Celeste" } });
    fireEvent.click(screen.getByRole("button", { name: "Run Search" }));
    await waitFor(() => expect(catalog.searchCatalog).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("link", { name: "Home", exact: true }));
    await screen.findByRole("link", { name: "Enter as developer" });
    fireEvent.click(screen.getByRole("link", { name: "Enter as developer" }));
    await screen.findByRole("heading", { name: "Research overview", exact: true });
    await act(async () => { resolve({
      intent: { titleQuery: "celeste", maxPrice: null, minRating: 0, hasReviews: false, tags: [], mode: "player",
        sortBy: null, sortDirection: "asc", limit: null, offset: 0 },
      games: [], source: "mock",
    }); });
    expect(window.location.hash).toBe("#developer");
    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    expect(screen.queryByText("No games match these filters.")).toBeNull();
  });

  it("translates the homepage and carries its language choice into the selected workspace", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    expect(screen.getByRole("link", { name: "以玩家身份进入" }).getAttribute("href")).toBe("#player");
    fireEvent.click(screen.getByRole("link", { name: "以开发者身份进入" }));
    await screen.findByRole("heading", { name: /^研究\s*概览$/ });
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
    fireEvent.click(screen.getByRole("link", { name: "首页", exact: true }));
    await screen.findByRole("link", { name: "以玩家身份进入" });
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(screen.getByRole("link", { name: "Enter as player" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Enter as developer" })).toBeTruthy();
  });
});
