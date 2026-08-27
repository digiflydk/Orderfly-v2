import { expect, test } from '@playwright/test';
import { resolveProductionRedirect } from '../src/lib/production-redirect';

test.describe('Production domain redirects', () => {
  test('redirects www host to canonical apex host and preserves path/query', async () => {
    const redirectTarget = resolveProductionRedirect(
      new URL('https://www.orderfly.dk/redirect-check/path?foo=bar&x=1'),
      'www.orderfly.dk',
      'https'
    );

    expect(redirectTarget).toBe('https://orderfly.dk/redirect-check/path?foo=bar&x=1');
  });

  test('redirects http apex host to https apex host and preserves path/query', async () => {
    const redirectTarget = resolveProductionRedirect(
      new URL('http://orderfly.dk/another-path?alpha=beta'),
      'orderfly.dk',
      'http'
    );

    expect(redirectTarget).toBe('https://orderfly.dk/another-path?alpha=beta');
  });

  test('does not redirect non-production hosts', async () => {
    const redirectTarget = resolveProductionRedirect(
      new URL('https://preview.orderfly.app/another-path?alpha=beta'),
      'preview.orderfly.app',
      'https'
    );

    expect(redirectTarget).toBeNull();
  });
});
