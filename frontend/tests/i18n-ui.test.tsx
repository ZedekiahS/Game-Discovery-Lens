import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { LANGUAGE_STORAGE_KEY, LanguageProvider, useI18n } from "../src/i18n";
import { translateError } from "../src/i18n/errors";
import * as catalog from "../src/services/catalog";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/?mode=demo#player");
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function LanguageProbe() {
  const { language, setLanguage, t } = useI18n();
  return <button onClick={() => setLanguage(language === "en" ? "zh" : "en")}>{t("English", "中文")}</button>;
}

describe("language switching in the actual application", () => {
  it("keeps selection, custom query and open drafts, and saves the same collection across languages and remounts", async () => {
    const getCatalog = vi.spyOn(catalog, "getCatalog");
    const getInsights = vi.spyOn(catalog, "getGameInsights");
    const originalCollectionInsights = catalog.getShortlistInsights;
    const getCollectionInsights = vi.spyOn(catalog, "getShortlistInsights").mockImplementation((...args) => {
      // Fail promptly if a state-effect regression creates an unbounded request loop.
      if (getCollectionInsights.mock.calls.length > 8) throw new Error("Unbounded collection insight requests");
      return originalCollectionInsights(...args);
    });
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Search games", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Celeste", exact: true }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Celeste", exact: true }));
    await screen.findByRole("heading", { name: "Celeste", level: 2 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save", exact: true }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    fireEvent.click(within(first.container.querySelector(".save-menu") as HTMLElement).getByRole("button", { name: "New Collection", exact: true }));
    fireEvent.change(screen.getByLabelText("New collection name"), { target: { value: "周末 Co-op" } });
    fireEvent.change(screen.getByLabelText("Search games"), { target: { value: "Hades under 24.99" } });
    const catalogCalls = getCatalog.mock.calls.length;
    const insightCalls = getInsights.mock.calls.length;
    const collectionInsightCalls = getCollectionInsights.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
    expect((screen.getByLabelText("搜索游戏") as HTMLTextAreaElement).value).toBe("Hades under 24.99");
    expect((screen.getByLabelText("新收藏夹名称") as HTMLInputElement).value).toBe("周末 Co-op");
    expect(screen.getByRole("heading", { name: "Celeste", level: 2 })).toBeTruthy();
    expect(getCatalog).toHaveBeenCalledTimes(catalogCalls);
    expect(getInsights).toHaveBeenCalledTimes(insightCalls);
    expect(getCollectionInsights).toHaveBeenCalledTimes(collectionInsightCalls);
    expect(first.container.querySelector(".insight-verdict")?.textContent).toContain("平台跳跃");
    expect(first.container.querySelector(".feature-stats")?.textContent).toContain("US$19.99");

    fireEvent.click(screen.getByRole("button", { name: "创建并收藏" }));
    await screen.findByRole("button", { name: "已收藏 (1)", exact: true });
    expect(screen.getByRole("option", { name: "周末 Co-op" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("option", { name: "周末 Co-op" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saved (1)", exact: true })).toBeTruthy();
    expect((screen.getByLabelText("Search games") as HTMLTextAreaElement).value).toBe("Hades under 24.99");
    const persisted = window.localStorage.getItem("game-discovery-lens.demo.collections.demo-user") ?? "";
    expect(persisted).toContain("周末 Co-op");
    expect(persisted).not.toContain("默认收藏夹");

    fireEvent.click(screen.getByRole("button", { name: "中文", exact: true }));
    first.unmount();
    render(<App />);
    await screen.findByRole("option", { name: "周末 Co-op" });
    expect(screen.getByRole("heading", { name: "为你推荐" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "搜索游戏", exact: true })).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toContain("游戏探索");
  });

  it("submits the Chinese preset and keeps canonical filter values and matching games", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "搜索游戏", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "剧情佳作" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "剧情佳作" }));
    await screen.findByText("5 个结果");
    expect((screen.getByLabelText("搜索游戏") as HTMLTextAreaElement).value).toBe("找25美元以下的高评分剧情游戏");
    expect([...container.querySelectorAll(".game-card h3")].map((el) => el.textContent)).toEqual(["Celeste", "Hades", "Outer Wilds", "SIGNALIS", "Sticky Business"]);
    fireEvent.click(screen.getByText("筛选条件", { exact: true }));
    expect((screen.getByRole("combobox", { name: "游戏类型" }) as HTMLSelectElement).value).toBe("Story Rich");
    expect(screen.getByRole("option", { name: "剧情丰富" }).getAttribute("value")).toBe("Story Rich");
    fireEvent.click(screen.getByRole("button", { name: "English", exact: true }));
    expect(screen.getByText("5 results")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Tag Focus" }) as HTMLSelectElement).value).toBe("Story Rich");
    expect((screen.getByLabelText("Search games") as HTMLTextAreaElement).value).toBe("Show highly rated story rich games under 25 dollars");
  });

  it("uses the saved preference ahead of browser language and keeps switching when storage is blocked", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("zh-CN");
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    const first = render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("reads the language preference saved before the product rename", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    window.localStorage.setItem("arcadeiq.ui.language", "zh");

    render(<LanguageProvider><LanguageProbe /></LanguageProvider>);

    expect(screen.getByRole("button", { name: "中文" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("localizes recovery instructions and status codes without discarding unknown error details", () => {
    const mutation = "The change could not be confirmed. Collection name already exists Reload collections before retrying.";
    expect(translateError(mutation, "en")).toBe(mutation);
    expect(translateError(mutation, "zh")).toBe("无法确认更改是否成功。收藏夹名称已存在。 重试前请先重新加载收藏夹。");
    expect(translateError("API request failed (503).", "zh")).toBe("API 请求失败（503）。");
    expect(translateError("Gateway trace abc-123", "zh")).toBe("原始错误：Gateway trace abc-123");
  });
});
