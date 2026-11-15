import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function profile(page: Page) {
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByLabel('Register email', { exact: true }).fill(`preferences-${randomUUID()}@example.test`);
  await page.getByLabel('Register display name', { exact: true }).fill('Preference player');
  await page.getByLabel('Register password', { exact: true }).fill('Preference-test-only-2026');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My taste', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'More of this', exact: true })).toBeVisible();
}

test('clean preferences follow another tab while dirty choices require explicit conflict review', async ({ page, context }) => {
  await profile(page);
  const second = await context.newPage();
  await second.goto('/?mode=api#player/profile');
  await second.getByRole('combobox', { name: 'Less of this', exact: true }).selectOption('Horror');
  await second.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Horror from avoided types' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'More of this', exact: true }).selectOption('Puzzle');
  await second.getByRole('combobox', { name: 'More of this', exact: true }).selectOption('Action');
  await second.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Your preferences changed elsewhere. Your unsaved choices are still here.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Puzzle from preferred types' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Keep my choices', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Remove Action from preferred types' })).toBeVisible();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Preferences saved', { exact: true })).toBeVisible();
  await second.reload();
  await expect(second.getByRole('button', { name: 'Remove Puzzle from preferred types' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Remove Horror from avoided types' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Remove Action from preferred types' })).toHaveCount(0);
});

test('a committed preference save with a lost response reconciles without an automatic write', async ({ page }) => {
  await profile(page);
  await page.getByRole('combobox', { name: 'More of this', exact: true }).selectOption('Puzzle');
  let writes = 0;
  await page.route('**/api/me/preferences', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort('connectionreset');
  });
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reload preferences', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel changes', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Puzzle from preferred types' })).toBeVisible();
  expect(writes).toBe(1);
});

test('Chinese phrase searches and the complete result order survive reload without interpretation requests', async ({ page }) => {
  let searches = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/search')) searches++; });
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.getByRole('button', { name: '搜索游戏', exact: true }).click();
  for (const [query, count] of [['第一人称射击', 8], ['自由建造', 4], ['生存恐怖', 5], ['Show all games', 80]] as const) {
    await page.getByRole('textbox', { name: '搜索游戏', exact: true }).fill(query);
    await page.getByRole('button', { name: '开始搜索', exact: true }).click();
    await expect(page.locator('.game-card')).toHaveCount(count);
    const names = await page.locator('.game-card h3').allTextContents();
    const requests = searches;
    await page.reload();
    await expect(page.locator('.game-card')).toHaveCount(count);
    expect(await page.locator('.game-card h3').allTextContents()).toEqual(names);
    expect(searches).toBe(requests);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
