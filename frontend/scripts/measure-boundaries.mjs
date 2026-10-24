// Run against an already-built preview and the isolated tests.serve_e2e API.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
const browser = await chromium.launch();
const rows = [];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const requests = [];
    page.on('request', r => { if (r.url().includes(':8011/api/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`); });
    async function measure(task, cache, action) {
      const offset = requests.length, start = performance.now();
      await action();
      rows.push({ viewport: `${viewport.width}x${viewport.height}`, sample, task, cache, ms: Math.round(performance.now()-start), requests: requests.slice(offset) });
    }
    await measure('first screen', 'new browser context; API/DB process warm', async () => {
      await page.goto('http://127.0.0.1:4191/?mode=api#player');
      await page.getByRole('heading', { name: 'Ready or Not', level: 2 }).waitFor();
      await page.waitForLoadState('networkidle');
    });
    await page.getByRole('button', {name:'Create Account',exact:true}).click();
    await page.getByLabel('Register email',{exact:true}).fill(`measure-${crypto.randomUUID()}@example.test`);
    await page.getByLabel('Register display name',{exact:true}).fill('Measurement');
    await page.getByLabel('Register password',{exact:true}).fill('Measurement-only-2026');
    await page.getByRole('button',{name:'Create',exact:true}).click();
    await page.getByRole('button',{name:'Like',exact:true}).waitFor();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:'Search games',exact:true}).click();
    await page.getByRole('textbox',{name:'Search games',exact:true}).fill('Celeste');
    await measure('search', 'catalog warm; Celeste detail cold', async () => {
      await page.getByRole('button',{name:'Run Search',exact:true}).click();
      await page.getByRole('heading',{name:'Celeste',level:2}).waitFor();
    });
    await page.waitForLoadState('networkidle');
    await measure('save feedback', 'warm', async () => {
      await page.getByRole('button',{name:'Like',exact:true}).click();
      await page.getByText('Preference saved',{exact:true}).waitFor();
    });
    await page.getByRole('link',{name:'My games',exact:true}).click();
    await page.getByRole('heading',{name:'My games',exact:true}).waitFor();
    await measure('detail return', 'public detail cache warm', async () => {
      await page.getByRole('link',{name:'Discover',exact:true}).click();
      await page.getByRole('heading',{name:'Celeste',level:2}).waitFor();
    });
    await measure('library return', 'account reads warm', async () => {
      await page.getByRole('link',{name:'My games',exact:true}).click();
      await page.getByRole('heading',{name:'My games',exact:true}).waitFor();
      await page.locator('.library-game').waitFor();
    });
    await context.close();
  }
}
await browser.close();
await writeFile(process.argv[2], JSON.stringify({ node:process.version, platform:os.platform(), cpu:os.cpus()[0].model, browser:'Chromium (installed Playwright)', network:'loopback, no throttling', catalog:80, build:'npm run build; vite preview; API rules only', timing:'wall clock action to observed UI; first screen includes networkidle 500ms; not Web Vitals', rows }, null, 2));
console.log(`Recorded ${rows.length} observations; no credentials captured.`);
