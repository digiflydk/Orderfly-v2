
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test.describe('Brand Website Smoke Tests', () => {
  test('Test 1: Template 1 Header Loads on Desktop', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page).toHaveURL(new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`));

    const header = page.getByTestId('template1-header');
    const button = header.getByRole('button', { name: 'Bestil nu', exact: true })

    await expect(header).toBeVisible();
    await expect(button).toBeVisible();
  });

  test('Test 2: Sticky CTA on Mobile', async ({ page }) => {
    await page.goto('/m3pizza');
    await page.setViewportSize({ width: 375, height: 667 });
    const stickyCta = page.locator('[data-testid="template1-sticky-cta"]');
    await expect(stickyCta).toBeVisible();
  });

  test('standard header opens the real delivery choice without a CMS API', async ({ page, request }) => {
    const response = await request.get(`${BASE_URL}/api/public/brand-website/template-1/header?brandSlug=esmeralda`);
    expect(response.status()).toBe(410);
    await page.goto('/m3pizza');
    await page.getByTestId('template1-header').getByRole('button', {name: 'Bestil nu', exact: true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', {name: /Jeg tager med/})).toBeVisible();
  });

  test('Test 4: Header is sticky on scroll', async ({ page }) => {
    await page.goto('/m3pizza');
    const header = page.locator('[data-testid="template1-header"]');

    // Check initial position
    let initialBoundingBox = await header.boundingBox();
    expect(initialBoundingBox?.y).toBeGreaterThanOrEqual(0);

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(100); // Wait for scroll and sticky positioning to apply

    // Check position after scroll
    let scrolledBoundingBox = await header.boundingBox();
    expect(scrolledBoundingBox?.y).toBe(0);

    // Check for sticky class
    await expect(header).toHaveClass(/sticky/);
  });

  test('retired mock confirmation never claims an order was received', async ({ page }) => {
    const response = await page.goto('/m3/esmeralda/esmeralda-pizza-amager/checkout/confirmation');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('Vi har modtaget din ordre og er i gang med at forberede den.')).toHaveCount(0);
  });

  test('M3Pizza delivery choice opens the shared commerce menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/m3pizza');

    await page.getByTestId('template1-sticky-cta').getByRole('button', { name: 'BESTIL HER' }).click();
    await page.getByRole('button', { name: /Leverer til mig/ }).click();

    await expect(page).toHaveURL(/\/esmeralda\/esmeralda-pizza-amager\?deliveryMethod=delivery$/);
    await expect(page.getByRole('heading', { name: 'M3 (Preview)' })).toHaveCount(0);
    await expect(page.getByText('Menu (mock)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick-up' })).toBeVisible();
    await expect(page.getByText('404')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('deliveryMethod'))).toBe('delivery');
  });

  test('M3Pizza takeaway choice is normalized to pickup', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/m3pizza');

    await page.getByTestId('template1-sticky-cta').getByRole('button', { name: 'BESTIL HER' }).click();
    await page.getByRole('button', { name: /Jeg tager med/ }).click();

    await expect(page).toHaveURL(/\/esmeralda\/esmeralda-pizza-amager\?deliveryMethod=pickup$/);
    await expect(page.getByRole('heading', { name: 'M3 (Preview)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick-up' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('deliveryMethod'))).toBe('pickup');
  });

  test('M3Pizza choice still opens the menu when browser storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'deliveryMethod') {
          throw new DOMException('Storage is unavailable', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/m3pizza');

    await page.getByTestId('template1-sticky-cta').getByRole('button', { name: 'BESTIL HER' }).click();
    await page.getByRole('button', { name: /Jeg tager med/ }).click();

    await expect(page).toHaveURL(/\/esmeralda\/esmeralda-pizza-amager\?deliveryMethod=pickup$/);
    await expect(page.getByRole('heading', { name: 'M3 (Preview)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick-up' })).toBeVisible();
  });

  for (const [requestedMethod, expectedMethod] of [
    ['delivery', 'delivery'],
    ['takeaway', 'pickup'],
    ['pickup', 'pickup'],
    ['invalid', 'pickup'],
  ] as const) {
    test(`legacy M3Pizza order link maps ${requestedMethod} to ${expectedMethod}`, async ({ page }) => {
      await page.goto(`/m3pizza/order?deliveryMethod=${requestedMethod}`);

      await expect(page).toHaveURL(
        new RegExp(`/esmeralda/esmeralda-pizza-amager\\?deliveryMethod=${expectedMethod}$`),
      );
      await expect.poll(() => page.evaluate(() => localStorage.getItem('deliveryMethod'))).toBe(expectedMethod);
    });
  }

  test('legacy M3Pizza order link redirects when browser storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'deliveryMethod') {
          throw new DOMException('Storage is unavailable', 'SecurityError');
        }
        return originalSetItem.call(this, key, value);
      };
    });

    await page.goto('/m3pizza/order?deliveryMethod=delivery');

    await expect(page).toHaveURL(
      /\/esmeralda\/esmeralda-pizza-amager\?deliveryMethod=delivery$/,
    );
    await expect(page.getByRole('heading', { name: 'M3 (Preview)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pick-up' })).toBeVisible();
  });

  test('retired M3Pizza preview route is not used as a storefront', async ({ page }) => {
    const response = await page.goto('/m3pizza/m3pizza/m3-pizza-hellerup');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'M3 (Preview)' })).toHaveCount(0);
  });
});
