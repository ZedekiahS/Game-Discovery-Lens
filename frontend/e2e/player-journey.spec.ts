import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const password = "Browser-test-only-2026";
async function register(page: Page, name = "River") {
  const email = `journey-${randomUUID()}@example.test`;
  await page.goto("/?mode=api");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("link", { name: "Enter as player", exact: true }).click();
  await page.getByRole("button", { name: "Create Account", exact: true }).click();
  await page.getByLabel("Register email", { exact: true }).fill(email);
  await page.getByLabel("Register display name", { exact: true }).fill(name);
  await page.getByLabel("Register password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
  await expect(page.getByLabel("Collection purpose", { exact: true })).toHaveValue("player");
  return email;
}

async function login(page: Page, email: string) {
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.getByLabel("User ID or email", { exact: true }).fill(email);
  await page.getByLabel("Account password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
}

test("real account journey persists records, updates recommendations, and isolates another account", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = await register(page);
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await login(page, email);
  await expect(page.getByRole("heading", { name: "Ready or Not", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Default Shortlist Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready or Not", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "For you", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Track this game", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Play status", exact: true }).selectOption("played");
  await editor.getByRole("radio", { name: "I like it", exact: true }).check();
  await editor.getByRole("textbox", { name: "Personal note", exact: true }).fill("Try the next mission with friends.");
  await editor.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole("link", { name: "My taste", exact: true }).click();
  await expect(page.getByText("Based on 1 distinct game you like or personally collect.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "More of this", exact: true }).selectOption("Puzzle");
  await page.getByRole("combobox", { name: "Less of this", exact: true }).selectOption("FPS");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.locator(".game-card")).toHaveCount(6);
  await expect(page.locator(".game-card").filter({ hasText: "Ready or Not" })).toHaveCount(0);
  await expect(page.getByText("Matches your preference: Puzzle", { exact: true }).first()).toBeVisible();
  const titles = await page.locator(".game-card h3").allTextContents();
  await page.reload();
  await expect(page.locator(".game-card h3")).toHaveText(titles);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "为你推荐", exact: true })).toBeVisible();
  await expect(page.getByText("符合你的偏好：解谜", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("link", { name: "My games", exact: true }).click();
  await page.getByRole("button", { name: /^Ready or Not / }).first().click();
  await expect(editor.getByRole("textbox", { name: "Personal note", exact: true })).toHaveValue("Try the next mission with friends.");
  await expect(editor.getByRole("combobox", { name: "Play status", exact: true })).toHaveValue("played");
  await editor.getByRole("button", { name: "Close game record", exact: true }).click();
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready or Not", exact: true })).toHaveCount(0);
  await register(page, "Second Player");
  await expect(page.getByRole("heading", { name: "Recommended games", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My games", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your shelf starts with one game", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My taste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make this space yours", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Puzzle from preferred types", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await login(page, email);
  await expect(page.getByText("Based on 1 distinct game you like or personally collect.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Puzzle from preferred types", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("reconciles a committed save whose response was lost without replaying the write", async ({ page }) => {
  await register(page);
  await page.getByRole("button", { name: "Track this game", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("combobox", { name: "Play status", exact: true }).selectOption("playing");
  await editor.getByRole("textbox", { name: "Personal note", exact: true }).fill("Keep this note after a lost response.");
  let writes = 0;
  await page.route("**/api/me/games/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200); // The real database committed before the browser lost the response.
    await route.abort("connectionreset");
  });
  await editor.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("could not be confirmed");
  await expect(editor.getByRole("button", { name: "Save record", exact: true })).toBeDisabled();
  await expect(editor.getByRole("textbox", { name: "Personal note", exact: true })).toHaveValue("Keep this note after a lost response.");
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Save record", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Close game record", exact: true }).click();
  await page.reload();
  await expect(page.locator(".library-game")).toHaveCount(1);
  await page.locator(".library-game").click();
  await expect(editor.getByRole("textbox", { name: "Personal note", exact: true })).toHaveValue("Keep this note after a lost response.");
  expect(writes).toBe(1);
});

test("protects unsaved drafts on close and browser Back, and cancels destructive collection actions", async ({ page }) => {
  await register(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Default Shortlist Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved (1)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Track this game", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Personal note", exact: true }).fill("Unfinished draft stays here.");
  let discardedPrompts = 0;
  page.on("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    discardedPrompts++;
    await dialog.dismiss();
  });
  await editor.getByRole("button", { name: "Close game record", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Personal note", exact: true })).toHaveValue("Unfinished draft stays here.");
  await page.goBack();
  await expect(page).toHaveURL(/#player\/library$/);
  await expect(editor.getByRole("textbox", { name: "Personal note", exact: true })).toHaveValue("Unfinished draft stays here.");
  expect(discardedPrompts).toBe(2);
  await editor.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const clear = page.getByRole("button", { name: "Clear shortlist", exact: true });
  await clear.click();
  const confirmation = page.getByRole("dialog", { name: "Clear this collection?", exact: true });
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await confirmation.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await expect(clear).toBeFocused();
  await expect(page.locator(".library-game")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Ready or Not $49.99", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My taste", exact: true }).click();
  await page.getByRole("combobox", { name: "More of this", exact: true }).selectOption("Puzzle");
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page).toHaveURL(/#player\/profile$/);
  await expect(page.getByRole("button", { name: "Remove Puzzle from preferred types", exact: true })).toBeVisible();
  expect(discardedPrompts).toBe(3);
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Puzzle from preferred types", exact: true })).toBeVisible();
  expect(discardedPrompts).toBe(4);
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  expect(discardedPrompts).toBe(4);
});

test("resumes a signed-out save, reports real write progress, and supports keyboard dismissal and search", async ({ page }) => {
  const email = await register(page);
  await page.getByRole("link", { name: "My taste", exact: true }).click();
  await page.getByRole("combobox", { name: "More of this", exact: true }).selectOption("Puzzle");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Preferences saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: "For you", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready or Not", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Sign in to save", exact: true }).click();
  await expect(page.getByLabel("User ID or email", { exact: true })).toBeFocused();
  await page.getByLabel("User ID or email", { exact: true }).fill(email);
  await page.getByLabel("Account password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("button", { name: "Default Shortlist Save", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Ready or Not", level: 2 })).toBeVisible();

  let releaseResponse!: () => void;
  const heldResponse = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let writes = 0;
  await page.route("**/api/saved-games", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    const response = await route.fetch();
    await heldResponse;
    await route.fulfill({ response }); // Return the real server response after checking the pending UI.
  });
  try {
    await page.getByRole("button", { name: "Default Shortlist Save", exact: true }).click();
    await expect(page.locator(".save-picker [role=status]")).toHaveText("Saving…");
    await expect(page.getByRole("button", { name: "Default Shortlist Saving…", exact: true })).toBeDisabled();
  } finally { releaseResponse(); }
  await expect(page.locator(".save-picker [role=status]")).toHaveText("Saved to Default Shortlist");
  expect(writes).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Saved (1)", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Saved (1)", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator(".save-menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Search games", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search games", exact: true });
  await search.fill("Celeste");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Celeste", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Track this game", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(editor.locator(".save-menu")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeVisible();
});
