import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('built UI registers, searches, saves and reloads against the packaged API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.getByLabel('Register email', { exact: true }).fill(`delivery-${randomUUID()}@example.test`);
  await page.getByLabel('Register display name', { exact: true }).fill('Delivery player');
  await page.getByLabel('Register password', { exact: true }).fill('Delivery-test-only-2026');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search games', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search games', exact: true }).fill('Hades under 30');
  await page.getByRole('button', { name: 'Run Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hades', exact: true, level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'Track this game', exact: true }).click();
  await page.getByRole('textbox', { name: 'Personal note', exact: true }).fill('Saved through the shipped app');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText('Game record saved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('.library-game').click();
  await expect(page.getByRole('textbox', { name: 'Personal note', exact: true })).toHaveValue('Saved through the shipped app');
  expect(errors).toEqual([]);
});
