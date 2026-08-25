import { expect, test } from '@playwright/test';

const base = process.env.ORDERFLY_LIVE_URL || 'https://orderfly.dk';

function expectSuccessfulResponse(response: Awaited<ReturnType<typeof test.info>> extends never ? never : any, label: string) {
  expect(response, `${label} did not return a navigation response`).not.toBeNull();
  expect(response.ok(), `${label} returned HTTP ${response.status()}`).toBeTruthy();
}

test('@post-deploy-smoke live landing page is healthy', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  expectSuccessfulResponse(response, 'production landing page');
  await expect(page.locator('body')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('@post-deploy-smoke public M3 brand surface renders', async ({ page }) => {
  const response = await page.goto(new URL('/m3pizza', base).toString(), { waitUntil: 'domcontentloaded' });
  expectSuccessfulResponse(response, 'production /m3pizza');
  await expect(page.locator('body')).toBeVisible();
});

test('@post-deploy-smoke public M3 brand surface has no mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const response = await page.goto(new URL('/m3pizza', base).toString(), { waitUntil: 'domcontentloaded' });
  expectSuccessfulResponse(response, 'mobile production /m3pizza');
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});
