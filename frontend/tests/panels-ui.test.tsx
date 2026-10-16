import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import * as catalog from "../src/services/catalog";
import * as users from "../src/services/users";
import { playerLibrary } from "../src/services/playerLibrary";
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
vi.mock("../src/services/playerLibrary", () => ({
  emptyPreferences: () => ({ preferredTags: [], avoidedTags: [] }),
  playerLibrary: { getRecords: vi.fn(), getPreferences: vi.fn(), saveRecord: vi.fn(), removeRecord: vi.fn(), savePreferences: vi.fn() },
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

async function signIn(expected = profile) {
  fireEvent.click(await screen.findByRole("button", { name: "Sign In" }));
  fireEvent.change(screen.getByLabelText("User ID or email"), { target: { value: ` ${expected.email} ` } });
  fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await screen.findByText(expected.displayName);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Collection" }).hasAttribute("disabled")).toBe(false));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?mode=api#player");
  vi.mocked(users.loginUser).mockResolvedValue(session);
  vi.mocked(playerLibrary.getRecords).mockResolvedValue([]);
  vi.mocked(playerLibrary.getPreferences).mockResolvedValue({ preferredTags: [], avoidedTags: [] });
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

describe("account, collection and save panel wiring", () => {
  it("protects unsaved preferences on explicit logout and discards them only after confirmation", async () => {
    render(<App />);
    await signIn();
    await act(async () => { window.location.hash = "#player/profile"; });
    const preferred = await screen.findByRole("combobox", { name: "More of this" });
    fireEvent.change(preferred, { target: { value: "Platformer" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(users.getStoredAuthToken()).toBe(session.accessToken);
    expect(screen.getByRole("button", { name: "Remove Platformer from preferred types" })).toBeTruthy();
    expect(playerLibrary.savePreferences).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(users.getStoredAuthToken()).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Platformer from preferred types" })).toBeNull();
  });

  it("focuses sign-in from Save and resumes the intended game after a failed login and a different personalized feed", async () => {
    vi.mocked(users.loginUser).mockRejectedValueOnce(new Error("Invalid user id or password"));
    let loadPreferences!: (value: { preferredTags: string[]; avoidedTags: string[] }) => void;
    vi.mocked(playerLibrary.getPreferences).mockReturnValue(new Promise((resolve) => { loadPreferences = resolve; }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /^Celeste / }));
    await screen.findByRole("heading", { name: "Celeste", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to save" }));
    expect(document.activeElement).toBe(screen.getByLabelText("User ID or email"));
    fireEvent.change(screen.getByLabelText("User ID or email"), { target: { value: profile.email } });
    fireEvent.change(screen.getByLabelText("Account password"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText(profile.displayName);
    expect(screen.queryByText("Choose Collection")).toBeNull();
    await act(async () => { loadPreferences({ preferredTags: ["FPS"], avoidedTags: ["Platformer"] }); });
    await screen.findByRole("button", { name: "Default Shortlist Save" });
    expect(screen.getByRole("heading", { name: "Celeste", level: 2 })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Default Shortlist Save" }));
    expect(catalog.saveGame).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByText("Choose Collection")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save", exact: true }));
  });

  it("cancels the requested save when sign-in is dismissed", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to save" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    await signIn();
    expect(screen.queryByText("Choose Collection")).toBeNull();
    expect(catalog.saveGame).not.toHaveBeenCalled();
  });

  it("keeps the requested save when a new player switches from sign-in to registration", async () => {
    vi.mocked(users.registerUser).mockResolvedValue(session);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to save" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Register email"));
    fireEvent.change(screen.getByLabelText("Register email"), { target: { value: profile.email } });
    fireEvent.change(screen.getByLabelText("Register display name"), { target: { value: profile.displayName } });
    fireEvent.change(screen.getByLabelText("Register password"), { target: { value: "test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create", exact: true }));
    await screen.findByRole("button", { name: "Default Shortlist Save" });
    expect(users.registerUser).toHaveBeenCalledOnce();
    expect(catalog.saveGame).not.toHaveBeenCalled();
  });

  it("keeps password requirements visible and explains invalid registration fields in either language", async () => {
    vi.mocked(users.registerUser).mockResolvedValue(session);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Account" }));
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create", exact: true }));
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Enter a display name.")).toBeTruthy();
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Register email"));
    expect(users.registerUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByText("请输入有效的邮箱地址。")).toBeTruthy();
    expect(screen.getByText("至少 8 个字符。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("注册邮箱"), { target: { value: " a@example.test " } });
    fireEvent.change(screen.getByLabelText("注册昵称"), { target: { value: " Account A " } });
    fireEvent.change(screen.getByLabelText("注册密码"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "创建", exact: true }));
    expect(document.activeElement).toBe(screen.getByLabelText("注册密码"));
    expect(users.registerUser).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("注册密码"), { target: { value: "test-password" } });
    expect(screen.getByLabelText("注册密码").getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "创建", exact: true }));
    await screen.findByText(profile.displayName);
    expect(users.registerUser).toHaveBeenCalledWith("a@example.test", "Account A", "test-password");
  });

  it("shows local save/remove progress and success, while keeping collection drafts when dismissing the picker", async () => {
    let finishSave!: (value: Awaited<ReturnType<typeof catalog.saveGame>>) => void;
    let finishRemove!: () => void;
    vi.mocked(catalog.saveGame).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    vi.mocked(catalog.removeSavedGame).mockReturnValue(new Promise((resolve) => { finishRemove = resolve; }));
    const { container } = render(<App />);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Save" }));
    const pending = screen.getByRole("button", { name: "Default Shortlist Saving…" });
    expect(pending.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Saving…");
    fireEvent.click(pending);
    expect(catalog.saveGame).toHaveBeenCalledTimes(1);
    const selected = vi.mocked(catalog.saveGame).mock.calls[0][0];
    await act(async () => { finishSave({ id: 10, userId: profile.id, collectionId: 1, gameId: selected.id, game: selected, createdAt: "2026-01-01" }); });
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Saved to Default Shortlist");
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Remove" }));
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Removing…");
    await act(async () => { finishRemove(); });
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Removed from Default Shortlist");
    fireEvent.click(screen.getByRole("button", { name: "New Collection" }));
    const draft = screen.getByLabelText("New collection name");
    fireEvent.change(draft, { target: { value: "Weekend picks" } });
    fireEvent.keyDown(draft, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect((screen.getByLabelText("New collection name") as HTMLInputElement).value).toBe("Weekend picks");
    const outside = screen.getByRole("button", { name: "English" });
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(screen.queryByText("Choose Collection")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("does not report success for an uncertain collection write, and keeps recovery accessible after dismissal", async () => {
    vi.mocked(catalog.saveGame).mockRejectedValue(new Error("Connection lost"));
    const { container } = render(<App />);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Default Shortlist Save" }));
    const picker = within(container.querySelector(".save-picker") as HTMLElement);
    await picker.findByRole("button", { name: "Reload collections" });
    expect(container.querySelector(".save-feedback")?.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Saved (1)" })).toBeNull();
    fireEvent.keyDown(picker.getByRole("button", { name: "Reload collections" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(picker.getByRole("button", { name: "Reload collections" })).toBeTruthy();
    fireEvent.click(picker.getByRole("button", { name: "Reload collections" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Default Shortlist Save" }).hasAttribute("disabled")).toBe(false));
    expect(catalog.saveGame).toHaveBeenCalledTimes(1);
  });

  it("reports create-and-save completion only after the game has also been saved", async () => {
    const created = { ...defaultCollection, id: 2, name: "Weekend picks" };
    vi.mocked(catalog.createCollection).mockResolvedValue(created);
    let finishSave!: (value: Awaited<ReturnType<typeof catalog.saveGame>>) => void;
    vi.mocked(catalog.saveGame).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    const { container } = render(<App />);
    await signIn();
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "New Collection" }));
    fireEvent.change(screen.getByLabelText("New collection name"), { target: { value: " Weekend picks " } });
    fireEvent.click(screen.getByRole("button", { name: "Create & Save" }));
    await waitFor(() => expect(catalog.saveGame).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Creating & saving…");
    expect(screen.getByLabelText("New collection name").hasAttribute("disabled")).toBe(true);
    const selected = vi.mocked(catalog.saveGame).mock.calls[0][0];
    await act(async () => { finishSave({ id: 10, userId: profile.id, collectionId: 2, gameId: selected.id, game: selected, createdAt: "2026-01-01" }); });
    expect(container.querySelector(".save-feedback")?.textContent).toBe("Saved to Weekend picks");
    expect(screen.queryByLabelText("New collection name")).toBeNull();
    expect(screen.getByRole("button", { name: "Weekend picks Remove" })).toBeTruthy();
  });

  it("replaces personalized recommendations when signing out and signing in as another account", async () => {
    vi.mocked(playerLibrary.getPreferences).mockImplementation(async (id) => ({ preferredTags: [id === profile.id ? "Platformer" : "FPS"], avoidedTags: [] }));
    const { container } = render(<App />);
    await signIn();
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(container.querySelector(".feature-reasons")?.textContent).toContain("Platformer");
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    expect(screen.queryByRole("heading", { name: "For you", exact: true })).toBeNull();
    expect(container.querySelector(".feature-reasons")).toBeNull();
    const second = { ...profile, id: "account-b", email: "b@example.test", displayName: "Account B" };
    vi.mocked(users.loginUser).mockResolvedValue({ ...session, user: second, accessToken: "token-b" });
    await signIn(second);
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(container.querySelector(".feature-reasons")?.textContent).toContain("FPS");
    expect(container.querySelector(".feature-reasons")?.textContent).not.toContain("Platformer");
  });

  it("shows general picks with recovery after preference failure, then applies the retried profile", async () => {
    vi.mocked(playerLibrary.getPreferences).mockRejectedValueOnce(new Error("Unavailable"));
    const { container } = render(<App />);
    await signIn();
    await screen.findByText("Your preferences could not be loaded. Showing general picks for now.");
    expect(screen.getByRole("heading", { name: "Recommended games", exact: true })).toBeTruthy();
    expect(container.querySelector(".feature-reasons")).toBeNull();
    vi.mocked(playerLibrary.getPreferences).mockResolvedValue({ preferredTags: ["Platformer"], avoidedTags: [] });
    fireEvent.click(screen.getByRole("button", { name: "Retry preferences", exact: true }));
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(container.querySelector(".feature-reasons")?.textContent).toContain("Platformer");
    expect(screen.queryByRole("button", { name: "Retry preferences" })).toBeNull();
  });

  it("waits for a full profile and ignores a late profile response after logout", async () => {
    let resolve!: (value: { preferredTags: string[]; avoidedTags: string[] }) => void;
    vi.mocked(playerLibrary.getPreferences).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { container } = render(<App />);
    await signIn();
    await screen.findByText("Finding your next game…");
    expect(container.querySelectorAll(".game-card")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    resolve({ preferredTags: ["Platformer"], avoidedTags: [] });
    await waitFor(() => expect(container.querySelectorAll(".game-card").length).toBeGreaterThan(0));
    expect(screen.queryByRole("heading", { name: "For you", exact: true })).toBeNull();
    expect(container.querySelector(".feature-reasons")).toBeNull();
  });

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
