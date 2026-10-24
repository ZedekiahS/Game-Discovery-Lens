import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const password = 'Boundary-browser-only-2026';
async function create(page: Page, name: string) {
  const email = `boundary-${randomUUID()}@example.test`;
  await page.getByRole('button', { name:'Create Account', exact:true }).click();
  await page.getByLabel('Register email', { exact:true }).fill(email);
  await page.getByLabel('Register display name', { exact:true }).fill(name);
  await page.getByLabel('Register password', { exact:true }).fill(password);
  await page.getByRole('button', { name:'Create', exact:true }).click();
  await expect(page.getByRole('button', { name:'Sign Out', exact:true })).toBeVisible();
  return email;
}
async function enter(page: Page) {
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name:'English', exact:true }).click();
}
async function login(page: Page, email: string) {
  await page.getByRole('button', { name:'Sign In', exact:true }).click();
  await page.getByLabel('User ID or email', { exact:true }).fill(email);
  await page.getByLabel('Account password', { exact:true }).fill(password);
  await page.getByRole('button', { name:'Sign In', exact:true }).click();
  await expect(page.getByRole('button', { name:'Sign Out', exact:true })).toBeVisible();
}

test('two tabs invalidate A, hide its draft from B and restore it only to A', async ({ page, context }) => {
  await enter(page);
  const emailA = await create(page, 'Boundary A');
  await page.getByRole('button', { name:'Track this game', exact:true }).click();
  await page.getByRole('textbox', { name:'Personal note', exact:true }).fill('Only A may restore this draft.');
  const second = await context.newPage();
  await enter(second);
  await expect(second.getByText('Boundary A', { exact:true })).toBeVisible();
  await second.getByRole('button', { name:'Sign Out', exact:true }).click();
  await create(second, 'Boundary B');
  await expect(page.getByText('Boundary B', { exact:true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name:/^All games0$/ })).toBeVisible();
  await second.getByRole('button', { name:'Sign Out', exact:true }).click();
  await login(second, emailA);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name:'Personal note', exact:true })).toHaveValue('Only A may restore this draft.');
  await page.getByRole('button', { name:'Save record', exact:true }).click();
  await expect(page.getByText('Game record saved.', { exact:true })).toBeVisible();
});

test('expired write prompts login, preserves the draft and never replays it', async ({ page }) => {
  await enter(page);
  const email = await create(page, 'Expiry');
  await page.getByRole('button', { name:'Track this game', exact:true }).click();
  await page.getByRole('textbox', { name:'Personal note', exact:true }).fill('Review after sign-in.');
  let writes = 0;
  await page.route('**/api/me/games/*', async route => {
    if (route.request().method() === 'PUT') { writes++; await route.fulfill({ status:401, contentType:'application/json', body:'{"detail":"Invalid or expired token"}' }); }
    else await route.continue();
  });
  await page.getByRole('button', { name:'Save record', exact:true }).click();
  await expect(page.getByText(/Your session has expired/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('**/api/me/games/*');
  await login(page, email);
  await expect(page.getByRole('textbox', { name:'Personal note', exact:true })).toHaveValue('Review after sign-in.');
  expect(writes).toBe(1);
  await page.getByRole('button', { name:'Save record', exact:true }).click();
  await expect(page.getByText('Game record saved.', { exact:true })).toBeVisible();
});

test('a 503 verification failure retains sign-in and recovers without credentials', async ({ page }) => {
  await enter(page);
  await create(page, 'Recovery');
  await page.route('**/api/auth/me', route => route.fulfill({ status:503, contentType:'application/json', body:'{"detail":"Unavailable"}' }));
  await page.reload();
  await expect(page.getByRole('button', { name:'Retry account', exact:true })).toBeVisible();
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name:'Retry account', exact:true }).click();
  await expect(page.getByText('Recovery', { exact:true })).toBeVisible();
});

test('deleting the filtered collection restores an effective library filter', async ({ page }) => {
  await enter(page);
  await create(page, 'Filtered library');
  await page.getByRole('button', { name:'Want to play', exact:true }).click();
  await expect(page.getByText('Preference saved', { exact:true })).toBeVisible();
  await page.getByRole('link', { name:'My games', exact:true }).click();
  await page.getByRole('button', { name:'New collection', exact:true }).click();
  await page.getByRole('textbox', { name:'Collection name', exact:true }).fill('Temporary filter');
  await page.getByRole('button', { name:'Create', exact:true }).click();
  await page.getByRole('combobox', { name:'Show collection', exact:true }).selectOption({ label:'Temporary filter' });
  await page.getByRole('button', { name:'Delete collection', exact:true }).click();
  await page.getByRole('button', { name:'Delete permanently', exact:true }).click();
  await expect(page.getByRole('combobox', { name:'Show collection', exact:true })).toHaveValue('');
  await expect(page.getByText('That collection is no longer available. Showing all collections.', { exact:true })).toBeVisible();
  await expect(page.locator('.library-game')).toHaveCount(1);
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name:'中文', exact:true }).click();
    expect(await page.evaluate(() => window.innerWidth)).toBe(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path:'../docs/screenshots/boundary-mobile-library-zh.png', fullPage:true });
    await page.getByRole('link', { name:'发现游戏', exact:true }).click();
    await page.getByText('资料来源与建议依据', { exact:true }).click();
    await expect(page.getByRole('link', { name:'玩法资料来源', exact:true })).toHaveAttribute('href', /^https:\/\/store.steampowered.com\/app\//);
    await expect(page.getByText('适用范围：仅玩法摘要和编辑整理的标签。')).toBeVisible();
    await page.screenshot({ path:'../docs/screenshots/boundary-mobile-provenance-zh.png', fullPage:true });
  }
});
