import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const password = 'Continuity-test-only-2026';
async function register(page: Page) {
  const email = `continuity-${randomUUID()}@example.test`;
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByLabel('Register email', { exact: true }).fill(email);
  await page.getByLabel('Register display name', { exact: true }).fill('Continuity');
  await page.getByLabel('Register password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  return email;
}
async function enter(page: Page) {
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name: 'English', exact: true }).click();
}
async function search(page: Page, query: string) {
  const open = page.getByRole('button', { name: 'Search games', exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole('textbox', { name: 'Search games', exact: true }).fill(query);
  await page.getByRole('button', { name: 'Run Search', exact: true }).click();
  await expect(page.getByText('These conditions are applied. Remove one or edit Filters to adjust the results.', { exact: true })).toBeVisible();
}

test('guest tracking resumes after login and a returning player can find and undo a dislike', async ({ page }) => {
  await enter(page);
  const email = await register(page);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await search(page, 'Celeste');
  await page.getByRole('button', { name: 'Track this game', exact: true }).click();
  await page.getByLabel('User ID or email', { exact: true }).fill(email);
  await page.getByLabel('Account password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('heading', { name: 'Celeste', exact: true })).toBeVisible();
  await editor.getByLabel('Not for me', { exact: true }).check();
  await editor.getByRole('textbox', { name: 'Personal note', exact: true }).fill('空中冲刺练习');
  await editor.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Game record saved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('textbox', { name: 'Find a game' }).fill('空中冲刺');
  await expect(page.locator('.library-game')).toHaveCount(1);
  await expect(page.getByText('Has note', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Not for me1$/ }).click();
  await page.getByRole('textbox', { name: 'Find a game' }).fill('No match');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your shelf', exact: true })).toBeVisible();
  await expect(page.locator('.library-game')).toHaveCount(1);
  await page.locator('.library-game').click();
  await editor.getByLabel('Undecided', { exact: true }).check();
  await editor.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Not for me0$/ })).toBeVisible();
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: '中文', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /Celeste/ })).toBeVisible();
  }
});

test('same-account tabs preserve the newer note when merging a stale status edit', async ({ page, context }) => {
  await enter(page); await register(page);
  await search(page, 'Hades under 30');
  await page.getByRole('button', { name: 'Track this game', exact: true }).click();
  await page.getByRole('textbox', { name: 'Personal note', exact: true }).fill('Original note');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Game record saved.', { exact: true })).toBeVisible();
  await page.locator('.library-game').click();
  await page.getByRole('combobox', { name: 'Play status', exact: true }).selectOption('playing');
  const second = await context.newPage();
  await second.goto('/?mode=api#player/library');
  await second.locator('.library-game').click();
  await second.getByRole('textbox', { name: 'Personal note', exact: true }).fill('Newer note in second tab');
  await second.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(second.getByText('Game record saved.', { exact: true })).toBeVisible();
  await expect(page.getByText('This record changed elsewhere. Your unsaved changes are still here.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Personal note', exact: true })).toHaveValue('Original note');
  await expect(page.getByRole('button', { name: 'Save record', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Merge my changes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Personal note', exact: true })).toHaveValue('Newer note in second tab');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Game record saved.', { exact: true })).toBeVisible();
  await second.reload(); await second.locator('.library-game').click();
  await expect(second.getByRole('textbox', { name: 'Personal note', exact: true })).toHaveValue('Newer note in second tab');
  await expect(second.getByRole('combobox', { name: 'Play status', exact: true })).toHaveValue('playing');
});

test('refresh and browser back restore applied conditions and selected detail without another search call', async ({ page }) => {
  let searches = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/search')) searches++; });
  await enter(page);
  await search(page, 'Hades under 30');
  await expect(page.getByRole('heading', { name: 'Hades', exact: true, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: /Hades II.*Action/ }).click();
  await expect(page.getByRole('heading', { name: 'Hades II', exact: true, level: 2 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hades II', exact: true, level: 2 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search games' })).toHaveValue('Hades under 30');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Hades', exact: true, level: 2 })).toBeVisible();
  expect(searches).toBe(1);
  await page.goto('/?mode=api#developer');
  await expect(page.getByRole('heading', { name: 'Research overview', exact: true })).toBeVisible();
  const card = page.getByRole('button', { name: 'Research Multiplayer', exact: true });
  await expect(card).toContainText('37');
  await card.click();
  await expect(page.getByText('37 results', { exact: true })).toBeVisible();
});
