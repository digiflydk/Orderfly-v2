const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fixture, formData, brand } = require('../helpers/brand-location-fixture.cjs');

const lib = loadTs('src/lib/brand-subdomain.ts');

test('#12 slugs are suggested from brand names with Danish letters spelled out', () => {
  assert.equal(lib.slugifyBrandName('Esmeralda'), 'esmeralda');
  assert.equal(lib.slugifyBrandName('Pizza & Pasta'), 'pizza-pasta');
  assert.equal(lib.slugifyBrandName('Smørrebrød på Ærø'), 'smoerrebroed-paa-aeroe');
  assert.equal(lib.slugifyBrandName('  Café  Élan!! '), 'cafe-elan');
  assert.ok(lib.slugifyBrandName('x'.repeat(80)).length <= lib.BRAND_SLUG_MAX);
});

test('#12 invalid, too short/long and reserved slugs are rejected with a reason', () => {
  assert.equal(lib.brandSlugError('esmeralda'), null);
  for (const bad of ['E', 'Esmeralda', '-esmeralda', 'esmeralda-', 'esme_ralda', 'esmé', 'a'.repeat(41)]) assert.ok(lib.brandSlugError(bad), bad);
  for (const reserved of ['www', 'api', 'admin', 'app', 'staging', 'mail', 'support', 'superadmin', 'merchant']) assert.match(lib.brandSlugError(reserved), /reserveret/);
});

test('#12 duplicate slugs get free alternatives', () => {
  const taken = new Set(['esmeralda', 'esmeralda-2']);
  assert.deepEqual(lib.brandSlugAlternatives('esmeralda', s => taken.has(s)), ['esmeralda-3', 'esmeralda-4', 'esmeralda-5']);
});

test('#12 only a single valid label under orderfly.dk (or localhost) selects a brand', () => {
  assert.equal(lib.brandSlugFromHost('esmeralda.orderfly.dk'), 'esmeralda');
  assert.equal(lib.brandSlugFromHost('Esmeralda.OrderFly.dk:443'), 'esmeralda');
  assert.equal(lib.brandSlugFromHost('esmeralda.localhost:3000'), 'esmeralda');
  for (const host of ['orderfly.dk', 'www.orderfly.dk', 'api.orderfly.dk', 'a.b.orderfly.dk', 'esmeralda.orderfly.dk.evil.com', 'evilorderfly.dk', 'localhost:3000', '', null])
    assert.equal(lib.brandSlugFromHost(host), null, String(host));
});

test('#12 subdomain paths are scoped to that brand; app-wide paths pass through', () => {
  assert.equal(lib.brandSubdomainRewrite('/', 'esmeralda'), '/esmeralda');
  assert.equal(lib.brandSubdomainRewrite('/esmeralda-pizza-amager', 'esmeralda'), '/esmeralda/esmeralda-pizza-amager');
  assert.equal(lib.brandSubdomainRewrite('/esmeralda-pizza-amager/checkout', 'esmeralda'), '/esmeralda/esmeralda-pizza-amager/checkout');
  // Existing absolute links stay valid.
  assert.equal(lib.brandSubdomainRewrite('/esmeralda/esmeralda-pizza-amager', 'esmeralda'), null);
  // Another brand's path never escapes this brand's scope.
  assert.equal(lib.brandSubdomainRewrite('/other-brand/amager', 'esmeralda'), '/esmeralda/other-brand/amager');
  for (const path of ['/_next/static/x.js', '/api/checkout/session', '/feedback', '/games/esmeralda', '/superadmin', '/robots.txt', '/icon.png'])
    assert.equal(lib.brandSubdomainRewrite(path, 'esmeralda'), null, path);
});

function middlewareFor() {
  const calls = [];
  const NextResponse = {
    next: () => ({ kind: 'next' }),
    rewrite: url => ({ kind: 'rewrite', path: url.pathname }),
    redirect: (url, status) => ({ kind: 'redirect', url: String(url), status }),
  };
  const mw = loadTs('src/middleware.ts', { 'next/server': { NextResponse } });
  const run = (url, headers = {}) => {
    const u = new URL(url);
    const nextUrl = Object.assign(new URL(url), { clone: () => new URL(url) });
    return mw.middleware({ url, nextUrl, headers: new Headers({ host: u.host, 'x-forwarded-proto': u.protocol.slice(0, -1), ...headers }) });
  };
  return { run, mw, calls };
}

test('#12 middleware rewrites brand subdomains and keeps the apex and www behavior', () => {
  const { run, mw } = middlewareFor();
  assert.deepEqual(run('https://esmeralda.orderfly.dk/'), { kind: 'rewrite', path: '/esmeralda' });
  assert.deepEqual(run('https://esmeralda.orderfly.dk/esmeralda-pizza-amager'), { kind: 'rewrite', path: '/esmeralda/esmeralda-pizza-amager' });
  assert.deepEqual(run('https://esmeralda.orderfly.dk/api/ok'), { kind: 'next' });
  // App Hosting passes the requested host in X-Forwarded-Host.
  assert.deepEqual(run('https://backend.internal/', { 'x-forwarded-host': 'esmeralda.orderfly.dk' }), { kind: 'rewrite', path: '/esmeralda' });
  assert.deepEqual(run('https://orderfly.dk/superadmin'), { kind: 'next' });
  assert.equal(mw.resolveProductionRedirect(new URL('http://esmeralda.orderfly.dk/x?a=1'), 'esmeralda.orderfly.dk', 'http'), 'https://esmeralda.orderfly.dk/x?a=1');
  assert.equal(mw.resolveProductionRedirect(new URL('https://www.orderfly.dk/y'), 'www.orderfly.dk', 'https'), 'https://orderfly.dk/y');
  assert.equal(mw.resolveProductionRedirect(new URL('https://esmeralda.orderfly.dk/'), 'esmeralda.orderfly.dk', 'https'), null);
});

test('#12 reserved slugs are rejected and duplicates suggest free alternatives when saving', async () => {
  const f = fixture();
  const reserved = await f.brands.createOrUpdateBrand(null, formData({ ...brand, slug: 'admin', ownerName: 'QA Owner', ownerEmail: 'qa@example.test' }));
  assert.equal(reserved.error, true);
  assert.match(reserved.message, /reserveret/);
  const duplicate = await f.brands.createOrUpdateBrand(null, formData({ ...brand, slug: 'cph-qa', ownerName: 'QA Owner', ownerEmail: 'qa@example.test' }));
  assert.equal(duplicate.error, true);
  assert.match(duplicate.message, /cph-qa-2/);
  assert.equal(f.writes.length, 0);
});

test('#12 changing an existing slug needs confirmation and is audit-logged with old and new value', async () => {
  const f = fixture();
  const unconfirmed = await f.brands.createOrUpdateBrand(null, formData({ ...brand, slug: 'esmeralda-new', ownerName: 'QA Owner', ownerEmail: 'qa@example.test' }));
  assert.equal(unconfirmed.error, true);
  assert.equal(f.records.get('brands/b').slug, 'esmeralda-qa');
  await f.brands.createOrUpdateBrand(null, formData({ ...brand, slug: 'esmeralda-new', confirmSlugChange: 'on', ownerName: 'QA Owner', ownerEmail: 'qa@example.test' })).catch(error => { if (!String(error.digest).startsWith('NEXT_REDIRECT')) throw error; });
  assert.equal(f.records.get('brands/b').slug, 'esmeralda-new');
  const audit = [...f.records.entries()].filter(([key]) => key.startsWith('auditLogs/')).map(([, value]) => value);
  assert.equal(audit.length, 1);
  assert.deepEqual({ ...audit[0], createdAt: undefined }, { action: 'brand_slug_changed', brandId: 'b', oldSlug: 'esmeralda-qa', newSlug: 'esmeralda-new', actorId: 'actor-1', createdAt: undefined });
});

test('#12 a suspended brand renders the neutral status page, never its storefront', async () => {
  // loadTs does not compile JSX; transpile this layout with the React JSX runtime.
  const ts = require('typescript'), fs = require('node:fs');
  const loadTsx = (file, mocks) => {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
    return mod.exports;
  };
  const render = status => loadTsx('src/app/[brandSlug]/layout.tsx', {
    react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
    '@/lib/data/brand-location': { getBrandBySlug: async () => (status ? { id: 'b', slug: 'esmeralda', name: 'Esmeralda', status } : null) },
    '@/context/cart-context': { CartProvider: ({ children }) => children },
    '@/context/analytics-context': { AnalyticsProvider: ({ children }) => children },
    './deliverymodalhost': { default: () => null }, './layout-client': { BrandLayoutClient: ({ children }) => children },
    '@/lib/next/resolve-props': { resolveParams: async p => p },
    '@/lib/runtime': { isAdminReady: () => true }, '@/components/brand-tracking': { BrandTracking: () => null },
  }).default({ children: 'STOREFRONT', params: Promise.resolve({ brandSlug: 'esmeralda' }) });
  const html = el => require('react-dom/server').renderToStaticMarkup(el);
  const suspended = html(await render('suspended'));
  assert.match(suspended, /data-brand-status="suspended"/);
  assert.doesNotMatch(suspended, /STOREFRONT|Esmeralda/);
  assert.match(html(await render('active')), /STOREFRONT/);
  await assert.rejects(render(null), /NOT_FOUND/);
});
