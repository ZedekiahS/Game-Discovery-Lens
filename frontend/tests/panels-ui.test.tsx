import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import * as catalog from "../src/services/catalog";
import * as users from "../src/services/users";
import fixture from "../../tests/fixtures/search-contract.json";
import type { AuthSession, Game, GameCollection, UserProfile } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "api", API_BASE_URL: "http://localhost:8000/api" }));
vi.mock("../src/services/users", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/users")>(),
  getAuthenticatedUser: vi.fn(), loginUser: vi.fn(), registerUser: vi.fn(),
}));
vi.mock("../src/services/catalog", () => ({
  getCatalog: vi.fn(), getCollections: vi.fn(), getSavedGames: vi.fn(), getShortlistInsights: vi.fn(),
  getGameDetail: vi.fn(), getGameInsights: vi.fn(), searchCatalog: vi.fn(),
  createCollection: vi.fn(), updateCollection: vi.fn(), deleteCollection: vi.fn(),
  saveGame: vi.fn(), removeSavedGame: vi.fn(), clearSavedGames: vi.fn(),
}));

const games: Game[] = fixture.games;
const celeste = games[0];
const budget = games[4];
const profile: UserProfile = {
  id: "account-a", email: "a@example.test", displayName: "Account A", role: "player",
  isActive: true, createdAt: "2026-01-01T00:00:00Z",
};
const session: AuthSession = { accessToken: "token-a", tokenType: "bearer", expiresIn: 3600, user: profile };
const defaultCollection: GameCollection = {
  id: 1, userId: profile.id, name: "Default Shortlist", description: "", createdAt: "2026-01-01",
};

async function signIn() {
  fireEvent.click(await screen.findByRole("button", { name: "Sign In" }));
  fireEvent.change(screen.getByLabelText("User ID or email"), { target: { value: " a@example.test " } });
  fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await screen.findByText(profile.displayName);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Collection" }).hasAttribute("disabled")).toBe(false));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?mode=api#player");
  vi.mocked(users.loginUser).mockResolvedValue(session);
  vi.mocked(catalog.getCatalog).mockResolvedValue(games);
  vi.mocked(catalog.getCollections).mockResolvedValue([defaultCollection]);
  vi.mocked(catalog.getSavedGames).mockResolvedValue([]);
  vi.mocked(catalog.getShortlistInsights).mockResolvedValue({
    userId: profile.id, savedCount: 0, averagePrice: 0, averageRating: 0, totalVisibleRevenue: 0,
    topTags: [], source: "rules", strategy: { title: "Collection strategy", caption: "Rules", body: "Collection evidence", bullets: [] },
  });
  vi.mocked(catalog.getGameDetail).mockImplementation(async (id) => games.find((game) => game.id === id) ?? null);
  vi.mocked(catalog.getGameInsights).mockImplementation(async (game) => {
    const panel = { title: "Review Intelligence", caption: "Rules", body: "Evidence for " + game.name, bullets: [] };
    return { gameId: game.id, signal: "Watch", source: "rules", reviewIntelligence: panel,
      playerRecommendation: { ...panel, title: "Player Recommendation" },
      developerOpportunity: { ...panel, title: "Developer Copilot" } };
  });
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("account, collection and save panel wiring", () => {
  it("keeps account permissions independent of the selected developer view", async () => {
    window.history.replaceState(null, "", "/?mode=api#developer");
    render(<App />);
    await signIn();

    expect(screen.getByRole("heading", { name: "Research overview", exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${celeste.name} `) }));
    await screen.findByRole("heading", { name: "Catalog analysis", exact: true });
    expect(screen.getByText("Player", { selector: ".role-pill" })).toBeTruthy();
    expect(users.loginUser).toHaveBeenCalledWith("a@example.test", "test-password");
    expect(catalog.getCollections).toHaveBeenCalledWith(profile.id);
  });

  it("submits a login, loads that account's collections, and clears identity and form fields on logout", async () => {
    render(<App />);
    await signIn();

    expect(users.loginUser).toHaveBeenCalledWith("a@example.test", "test-password");
    expect(users.getStoredAuthToken()).toBe(session.accessToken);
    expect(catalog.getCollections).toHaveBeenCalledWith(profile.id);
    expect(catalog.getSavedGames).toHaveBeenCalledWith(games, profile.id, defaultCollection.id);
    expect(screen.queryByLabelText("Account password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(screen.queryByText(profile.displayName)).toBeNull();
    expect(screen.queryByRole("option", { name: defaultCollection.name })).toBeNull();
    expect(users.getStoredAuthToken()).toBeNull();
    expect(screen.getByText("Sign in to load and save your collections.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect((screen.getByLabelText("User ID or email") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Account password") as HTMLInputElement).value).toBe("");
  });

  it("creates a collection, switches between collections, and renames the selected one", async () => {
    const created = { ...defaultCollection, id: 2, name: "Wishlist" };
    vi.mocked(catalog.createCollection).mockResolvedValue(created);
    vi.mocked(catalog.updateCollection).mockResolvedValue({ ...created, name: "Research picks" });
    render(<App />);
    await signIn();

    fireEvent.click(screen.getByRole("button", { name: "New collection" }));
    fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: " Wishlist " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("option", { name: "Wishlist" });
    expect(catalog.createCollection).toHaveBeenCalledWith("Wishlist", profile.id, "player");
    expect((screen.getByRole("combobox", { name: "Collection" }) as HTMLSelectElement).value).toBe("2");
    expect(screen.queryByLabelText("Collection name")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Collection" }), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Rename collection" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Collection" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename collection" }));
    const renameInput = screen.getByRole("textbox", { name: "Rename collection" });
    expect((renameInput as HTMLInputElement).value).toBe("Wishlist");
    fireEvent.change(renameInput, { target: { value: " Research picks " } });
    fireEvent.submit(renameInput.closest("form")!);

    await screen.findByRole("option", { name: "Research picks" });
    expect(catalog.updateCollection).toHaveBeenCalledWith(2, "Research picks", profile.id);
    expect((screen.getByRole("combobox", { name: "Collection" }) as HTMLSelectElement).value).toBe("2");
    expect(screen.queryByRole("textbox", { name: "Rename collection" })).toBeNull();
  });

  it("saves the selected game and discards an open collection draft when another game is selected", async () => {
    vi.mocked(catalog.searchCatalog).mockResolvedValue({
      intent: { titleQuery: null, maxPrice: null, minRating: 0, hasReviews: false, tags: [], mode: "player",
        sortBy: null, sortDirection: "asc", limit: null, offset: 0 },
      games: [celeste, budget], source: "rules",
    });
    vi.mocked(catalog.saveGame).mockResolvedValue({
      id: 10, userId: profile.id, collectionId: defaultCollection.id, gameId: celeste.id,
      createdAt: "2026-01-01", game: celeste,
    });
    render(<App />);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Celeste" }));
    await screen.findByRole("heading", { name: celeste.name, level: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Save" }));
    await screen.findByRole("button", { name: "Saved (1)" });
    expect(catalog.saveGame).toHaveBeenCalledWith(celeste, games, profile.id, defaultCollection.id);
    expect(screen.getByRole("button", { name: "Default Shortlist Remove" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New Collection" }));
    fireEvent.change(screen.getByLabelText("New collection name"), { target: { value: "Unsubmitted draft" } });

    fireEvent.click(screen.getByRole("button", { name: /^Budget FPS / }));
    await screen.findByRole("heading", { name: budget.name, level: 2 });
    expect(screen.queryByText("Choose Collection")).toBeNull();
    expect(screen.queryByLabelText("New collection name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "New Collection" }));
    expect((screen.getByLabelText("New collection name") as HTMLInputElement).value).toBe("");
    expect(catalog.createCollection).not.toHaveBeenCalled();
  });
});
