import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import { games } from "../src/data/games";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));
const titles = (container: HTMLElement) => [...container.querySelectorAll(".game-card h3")].map((el) => el.textContent);
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo#player");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("profile-driven discovery", () => {
  it("still opens a saved game intentionally, even when it is excluded from recommendations", async () => {
    const celeste = games.find((game) => game.name === "Celeste")!;
    window.localStorage.setItem("game-discovery-lens.demo.savedCollectionGameIds.demo-user", JSON.stringify({ 1: [celeste.id] }));
    window.localStorage.setItem("game-discovery-lens.demo.player.demo-user.games", JSON.stringify([
      { gameId: celeste.id, status: "played", affinity: "like", notes: "", updatedAt: "2026-10-15" },
    ]));
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(titles(container)).not.toContain("Celeste");
    fireEvent.click(screen.getByRole("button", { name: /^Celeste \$19.99/ }));
    await screen.findByRole("heading", { name: "Celeste", level: 2 });
    expect(container.querySelector(".feature-reasons")).toBeNull();
    expect(container.querySelector(".feature-kicker")?.textContent).toContain("In focus");
    expect(titles(container)).not.toContain("Celeste");
  });

  it("uses edited preferences immediately, retains them after refresh, and keeps explicit search independent", async () => {
    const first = render(<App />);
    await screen.findByRole("heading", { name: "Ready or Not", level: 2 });
    fireEvent.click(screen.getByRole("link", { name: "Set my preferences", exact: true }));
    const prefer = await screen.findByRole("combobox", { name: "More of this" });
    fireEvent.change(prefer, { target: { value: "Puzzle" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Less of this" }), { target: { value: "FPS" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    await screen.findByText("Preferences saved");
    fireEvent.click(screen.getByRole("link", { name: "Discover", exact: true }));
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(titles(first.container).every((name) => games.find((g) => g.name === name)?.tags.includes("Puzzle"))).toBe(true);
    expect(titles(first.container)).not.toContain("Ready or Not");
    const ordering = titles(first.container);
    expect(first.container.querySelector(".feature-copy h2")?.textContent).toBe(ordering[0]);
    first.unmount();
    const refreshed = render(<App />);
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(titles(refreshed.container)).toEqual(ordering);
    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    expect(screen.getByRole("heading", { name: "为你推荐", exact: true })).toBeTruthy();
    expect(screen.getAllByText("符合你的偏好：解谜").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search games", exact: true }), { target: { value: "Ready or Not" } });
    fireEvent.click(screen.getByRole("button", { name: "Run Search", exact: true }));
    await screen.findByRole("heading", { name: "Ready or Not", level: 2 });
    expect(titles(refreshed.container)).toEqual(["Ready or Not"]);
    expect(screen.queryByText("Matches your preference: Puzzle")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to recommendations", exact: true }));
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(titles(refreshed.container)).toEqual(ordering);
  });

  it("removes a game marked played from both cards and the featured pick on return", async () => {
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "Ready or Not", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Track this game", exact: true }));
    const editor = within(await screen.findByRole("dialog"));
    fireEvent.change(editor.getByLabelText("Play status"), { target: { value: "played" } });
    fireEvent.click(editor.getByLabelText("I like it"));
    fireEvent.click(editor.getByRole("button", { name: "Save record" }));
    await screen.findByText("Game record saved.");
    fireEvent.click(screen.getByRole("link", { name: "Discover", exact: true }));
    await screen.findByRole("heading", { name: "For you", exact: true });
    expect(titles(container)).not.toContain("Ready or Not");
    await waitFor(() => expect(container.querySelector(".feature-copy h2")?.textContent).toBe(titles(container)[0]));
    expect(container.querySelector(".feature-reasons")?.textContent).toContain("Ready or Not");
  });
});
