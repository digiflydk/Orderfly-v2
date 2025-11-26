
import { test, expect } from '@playwright/test';
import type { WebsiteHeaderConfig } from '../src/types/website';

test.describe('Brand Website Smoke Tests', () => {
  const BASE_URL = 'http://localhost:3000';

  test('Test 1: Template 1 Header Loads on Desktop', async ({ page }) => {
    await page.goto('/m3pizza');
    await expect(page.locator('header[data-header]')).toBeVisible();
    await expect(page.locator('header[data-header] button:has-text("Bestil nu")')).toBeVisible();
  });

  test('Test 2: Sticky CTA on Mobile', async ({ page }) => {
    await page.goto('/m3pizza');
    await page.setViewportSize({ width: 375, height: 667 });
    const stickyCta = page.locator('[data-testid="template1-sticky-cta"]');
    await expect(stickyCta).toBeVisible();
  });

  test('Test 3: CTA Label Matches Public Config', async ({ page, request }) => {
    const response = await request.get(`${BASE_URL}/api/public/brand-website/template-1/header-props?brandSlug=m3pizza`);
    expect(response.ok()).toBeTruthy();
    const config: { header: WebsiteHeaderConfig, ctaText: string } = await response.json();
    const expectedCtaLabel = config.ctaText || 'Bestil her';

    await page.goto('/m3pizza');
    await expect(page.locator('header[data-header] button')).toContainText(expectedCtaLabel);
  });

  test('CMS Config pages load without runtime errors', async ({ page }) => {
    const paths = [
      '/superadmin/brands/esmeralda/website',
      '/superadmin/brands/esmeralda/website/config',
    ];

    for (const path of paths) {
      await page.goto(path);
      const hasConsoleError = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes("A 'use server' file can only export async functions");
      });
      expect(hasConsoleError).toBeFalsy();
    }
  });
});
