import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import { playerLibrary } from "../src/services/playerLibrary";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  window.history.replaceState(null, "", "/?mode=demo#player/library");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("library to profile journey", () => {
  it("restores filters, ordering and search when returning from the profile", async () => {
    await playerLibrary.saveRecord("demo-user", 2, { status: "want_to_play", affinity: "like", notes: "Keep me" });
    render(<App />);
    const search = await screen.findByLabelText("Find a game");
    fireEvent.change(search, { target: { value: "Celeste" } });
    fireEvent.change(screen.getByLabelText("Sort games"), { target: { value: "name" } });
    fireEvent.click(screen.getByRole("button", { name: /^Liked/ }));
    fireEvent.change(screen.getByLabelText("Show collection"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("link", { name: "My taste", exact: true }));
    await screen.findByRole("heading", { name: "My gaming taste" });
    fireEvent.click(screen.getByRole("link", { name: "My games", exact: true }));
    expect((await screen.findByLabelText("Find a game") as HTMLInputElement).value).toBe("Celeste");
    expect((screen.getByLabelText("Sort games") as HTMLSelectElement).value).toBe("name");
    expect((screen.getByLabelText("Show collection") as HTMLSelectElement).value).toBe("1");
    expect(screen.getByRole("button", { name: /^Liked/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("saves a bilingual record, restores it after remount, and uses it as profile evidence", async () => {
    const first = render(<App />);
    const add = await screen.findByRole("button", { name: "Add games" });
    await waitFor(() => expect(add.hasAttribute("disabled")).toBe(false));
    fireEvent.click(add);
    fireEvent.change(screen.getByRole("textbox", { name: "Find a game" }), { target: { value: "Celeste" } });
    fireEvent.click(screen.getByRole("button", { name: /Celeste/ }));
    const editor = within(screen.getByRole("dialog"));
    fireEvent.change(editor.getByLabelText("Play status"), { target: { value: "playing" } });
    fireEvent.click(editor.getByLabelText("I like it"));
    fireEvent.change(editor.getByLabelText("Personal note"), { target: { value: "练习空中冲刺" } });
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect((editor.getByLabelText("个人笔记") as HTMLTextAreaElement).value).toBe("练习空中冲刺");
    fireEvent.click(editor.getByRole("button", { name: "保存记录" }));
    await screen.findByText("游戏记录已保存。");
    first.unmount();
    render(<App />);
    await screen.findByRole("button", { name: /Celeste/ });
    fireEvent.click(screen.getByRole("link", { name: "玩家画像", exact: true }));
    await screen.findByText("依据你喜欢或个人收藏的 1 款不同游戏。");
    expect(screen.getByRole("heading", { name: "你玩过哪些类型" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("更偏爱"), { target: { value: "Puzzle" } });
    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }));
    await screen.findByText("偏好已保存");
    fireEvent.click(screen.getByRole("link", { name: "我的游戏库", exact: true }));
    await screen.findByRole("button", { name: /Celeste/ });
    fireEvent.click(screen.getByRole("button", { name: /Celeste/ }));
    expect((screen.getByLabelText("个人笔记") as HTMLTextAreaElement).value).toBe("练习空中冲刺");
    fireEvent.click(screen.getByRole("button", { name: "移除记录" }));
    fireEvent.click(screen.getByRole("button", { name: "确认移除" }));
    await screen.findByText("游戏记录已移除。");
    fireEvent.click(screen.getByRole("link", { name: "玩家画像", exact: true }));
    await screen.findByText("从你的喜好开始");
    expect(screen.getByRole("button", { name: "从偏爱中移除解谜" })).toBeTruthy();
  });
  it("does not erase existing collections when introducing the library", async () => {
    window.localStorage.setItem("game-discovery-lens.demo.savedCollectionGameIds.demo-user", JSON.stringify({ 1: [2] }));
    render(<App />);
    await screen.findByRole("heading", { name: "Celeste" });
    fireEvent.change(screen.getByLabelText("Collection purpose"), { target: { value: "player" } });
    await waitFor(() => expect((screen.getByLabelText("Collection purpose") as HTMLSelectElement).value).toBe("player"));
    fireEvent.click(screen.getByRole("link", { name: "My taste", exact: true }));
    await screen.findByText("Based on 1 distinct game you like or personally collect.");
    expect(screen.getByText("Mark a game as Playing or Played to start your play history.")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("game-discovery-lens.demo.savedCollectionGameIds.demo-user")!)).toEqual({ 1: [2] });
  });
});


describe("protecting player changes", () => {
  async function openRecord() {
    render(<App />);
    const add = await screen.findByRole("button", { name: "Add games" });
    await waitFor(() => expect(add.hasAttribute("disabled")).toBe(false));
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Find a game"), { target: { value: "Celeste" } });
    fireEvent.click(screen.getByRole("button", { name: /Celeste/ }));
    fireEvent.change(screen.getByLabelText("Personal note"), { target: { value: "Keep my draft" } });
  }

  it("keeps a dirty note on cancelled close, Escape, route exit and refresh", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openRecord();
    fireEvent.click(screen.getByRole("button", { name: "Close game record" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect((screen.getByLabelText("Personal note") as HTMLTextAreaElement).value).toBe("Keep my draft");
    window.history.pushState(null, "", "#player/profile");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(window.location.hash).toBe("#player/library");
    const refresh = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(refresh);
    expect(refresh.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(3);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Close game record" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const cleanRefresh = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanRefresh);
    expect(cleanRefresh.defaultPrevented).toBe(false);
  });

  it("retains a note while reloading after an unconfirmed write", async () => {
    await openRecord();
    vi.spyOn(playerLibrary, "saveRecord").mockRejectedValueOnce(new Error("Connection lost"));
    fireEvent.click(screen.getByRole("button", { name: "Save record" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy());
    let resolve!: (rows: []) => void;
    vi.spyOn(playerLibrary, "getRecords").mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry" }));
    expect((screen.getByLabelText("Personal note") as HTMLTextAreaElement).value).toBe("Keep my draft");
    expect(screen.getByRole("button", { name: "Save record" }).hasAttribute("disabled")).toBe(true);
    resolve([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save record" }).hasAttribute("disabled")).toBe(false));
    expect((screen.getByLabelText("Personal note") as HTMLTextAreaElement).value).toBe("Keep my draft");
  });

  it("protects unsaved preferences on navigation and allows an explicit discard", async () => {
    window.history.replaceState(null, "", "/?mode=demo#player/profile");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.change(await screen.findByLabelText("More of this"), { target: { value: "Puzzle" } });
    fireEvent.click(screen.getByRole("link", { name: "Discover", exact: true }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(window.location.hash).toBe("#player/profile");
    expect(screen.getByRole("button", { name: "Remove Puzzle from preferred types" })).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "Discover", exact: true }));
    await screen.findByRole("heading", { name: "What will you play next?" });
  });

  it("requires confirmation before clearing or deleting and preserves unrelated records", async () => {
    const collectionsKey = "game-discovery-lens.demo.collections.demo-user";
    const savedKey = "game-discovery-lens.demo.savedCollectionGameIds.demo-user";
    window.localStorage.setItem(collectionsKey, JSON.stringify([
      { id: 1, userId: "demo-user", name: "Default Shortlist", description: "", createdAt: "", purpose: "player" },
      { id: 2, userId: "demo-user", name: "Research picks", description: "", createdAt: "", purpose: "research" },
    ]));
    window.localStorage.setItem(savedKey, JSON.stringify({ 1: [2], 2: [2] }));
    await playerLibrary.saveRecord("demo-user", 2, { status: "playing", affinity: "like", notes: "Keep this note" });
    render(<App />);
    const clearButton = await screen.findByRole("button", { name: "Clear shortlist" });
    clearButton.focus();
    fireEvent.click(clearButton);
    const dialog = screen.getByRole("dialog", { name: "Clear this collection?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)[1]).toEqual([2]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(clearButton);
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear collection", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)).toEqual({ 1: [], 2: [2] });
    expect((await playerLibrary.getRecords("demo-user"))[0].notes).toBe("Keep this note");
    fireEvent.change(screen.getByLabelText("Collection", { exact: true }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete collection", exact: true }));
    expect(JSON.parse(window.localStorage.getItem(collectionsKey)!)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(collectionsKey)!)).toHaveLength(1);
    expect((await playerLibrary.getRecords("demo-user"))[0].notes).toBe("Keep this note");
  });
});
