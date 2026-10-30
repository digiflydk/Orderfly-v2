const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { isEsmeraldaV2Host } = loadTs('src/lib/esmeralda-v2-host.ts');
const lib = loadTs('src/lib/brand-subdomain.ts');

test('#780 V2 is an exact host alias for the existing Esmeralda tenant', () => {
  for (const host of ['esmeralda2.orderfly.dk', 'ESMERALDA2.ORDERFLY.DK:443']) {
    assert.equal(isEsmeraldaV2Host(host), true);
    assert.equal(lib.brandSlugFromHost(host), 'esmeralda');
    assert.equal(lib.orderEntryUrl(host, 'esmeralda', 'amager'), '/amager');
  }
  for (const host of ['esmeralda.orderfly.dk', 'orderfly.dk', 'esmeralda2.localhost', 'esmeralda2.orderfly.dk.evil.test', 'other.esmeralda2.orderfly.dk', null]) {
    assert.equal(isEsmeraldaV2Host(host), false);
  }
  assert.equal(lib.brandSlugFromHost('esmeralda.orderfly.dk'), 'esmeralda');
  assert.equal(lib.brandSlugFromHost('other.orderfly.dk'), 'other');
  assert.match(lib.brandSlugError('esmeralda2'), /reserveret/);
});

test('#780 V2 routes menu and payment returns to existing pages and preserves query parameters', () => {
  const NextResponse = {
    next: () => ({ kind: 'next' }),
    rewrite: url => ({ kind: 'rewrite', path: url.pathname, search: url.search }),
    redirect: (url, status) => ({ kind: 'redirect', url: String(url), status }),
  };
  const { middleware } = loadTs('src/middleware.ts', { 'next/server': { NextResponse } });
  const run = path => {
    const url = `https://esmeralda2.orderfly.dk${path}`;
    return middleware({ url, nextUrl: Object.assign(new URL(url), { clone: () => new URL(url) }), headers: new Headers({ host: 'esmeralda2.orderfly.dk', 'x-forwarded-proto': 'https' }) });
  };
  assert.deepEqual(run('/'), { kind: 'rewrite', path: '/esmeralda', search: '' });
  assert.deepEqual(run('/amager?deliveryMethod=pickup'), { kind: 'rewrite', path: '/esmeralda/amager', search: '?deliveryMethod=pickup' });
  for (const end of ['confirmation', 'cancel']) {
    assert.deepEqual(run(`/amager/checkout/${end}?order_id=QA&token=test`), { kind: 'rewrite', path: `/esmeralda/amager/checkout/${end}`, search: '?order_id=QA&token=test' });
    assert.deepEqual(run(`/esmeralda/amager/checkout/${end}`), { kind: 'next' });
  }
  assert.deepEqual(run('/other/amager'), { kind: 'rewrite', path: '/esmeralda/other/amager', search: '' });
  for (const path of ['/api/checkout/session', '/_next/static/app.js', '/fonts/inter/inter-latin-wght-normal.woff2']) assert.deepEqual(run(path), { kind: 'next' });
});

test('#780 server navigation stays on the V2 origin with existing brand and location', async () => {
  const { storefrontHref } = loadTs('src/lib/server/storefront-path.ts', {
    'server-only': {},
    'next/headers': { headers: async () => new Headers({ host: 'internal.host', 'x-forwarded-host': 'esmeralda2.orderfly.dk' }) },
  });
  assert.equal(await storefrontHref('esmeralda', 'amager', 'checkout'), '/amager/checkout');
  assert.equal(await storefrontHref('other', 'location'), '/other/location');
});

test('#780 Stripe session returns preserve V2 origin with real Esmeralda alias', async () => {
  const { checkout } = require('../helpers/checkout-fixture.cjs');
  const { result, sessionParams } = await checkout({ origin: 'https://esmeralda2.orderfly.dk', brandOverrides: { slug: 'esmeralda' }, locationOverrides: { slug: 'amager' }, requestedBrandSlug: 'esmeralda', requestedLocationSlug: 'amager' });
  assert.equal(result.success, true, result.error);
  assert.match(sessionParams.success_url, /^https:\/\/esmeralda2\.orderfly\.dk\/amager\/checkout\/confirmation\?order_id=/);
  assert.match(sessionParams.cancel_url, /^https:\/\/esmeralda2\.orderfly\.dk\/amager\/checkout\/cancel\?order_id=/);
});
