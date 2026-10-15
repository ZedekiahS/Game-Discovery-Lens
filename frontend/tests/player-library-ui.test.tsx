import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";

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
