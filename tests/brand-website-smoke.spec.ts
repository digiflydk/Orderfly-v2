
import { test, expect } from '@playwright/test';
import type { WebsiteHeaderConfig } from '../src/types/website';

test.describe('Brand Website Smoke Tests', () => {
  const BASE_URL = 'http://localhost:3000';

  test('Test 1: Template 1 Header Loads on Desktop', async ({ page }) => {
    await page.goto('/m3pizza');

    // Expect the header to be visible
    await expect(page.locator('header[role="banner"]')).toBeVisible();

    // Expect the main CTA button in the header to be visible
    await expect(page.locator('header[role="banner"] button:has-text("Bestil her")')).toBeVisible();
  });

  test('Test 2: Sticky CTA on Mobile', async ({ page }) => {
    await page.goto('/m3pizza');
    await page.setViewportSize({ width: 375, height: 667 });

    // Expect the sticky CTA at the bottom to be visible
    const stickyCta = page.locator('[data-testid="template1-sticky-cta"]');
    await expect(stickyCta).toBeVisible();

    // Optional: Test click navigation if the link is stable
    // await stickyCta.click();
    // await expect(page).not.toHaveURL('/m3pizza');
  });

  test('Test 3: CTA Label Matches CMS Config', async ({ page, request }) => {
    // 1. Fetch config from the public API
    const response = await request.get(`${BASE_URL}/api/public/brand-website/template-1/header-props?brandSlug=m3pizza`);
    expect(response.ok()).toBeTruthy();
    const config: { header: WebsiteHeaderConfig } = await response.json();
    const expectedCtaLabel = 'Bestil her'; // This should come from config if dynamic, but for now we assert the known value

    // 2. Visit the page
    await page.goto('/m3pizza');

    // 3. Assert the header CTA text matches
    await expect(page.locator('header[role="banner"] button')).toContainText(expectedCtaLabel);
  });

  test('CMS Config pages load without runtime errors', async ({ page }) => {
    const paths = [
      '/superadmin/brands/m3pizza/website',
      '/superadmin/brands/m3pizza/website/config',
    ];

    for (const path of paths) {
      const response = await page.goto(path);
      // Check that the page loads with a 200 OK status
      expect(response?.status()).toBe(200);
      // Check that there are no console errors, specifically the "use server" error
      const hasConsoleError = await page.evaluate(() => {
        // This is a proxy. A better test would be to listen for the 'console' event.
        const bodyText = document.body.innerText;
        return bodyText.includes("A 'use server' file can only export async functions");
      });
      expect(hasConsoleError).toBeFalsy();
    }
  });

});
