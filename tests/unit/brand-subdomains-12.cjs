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
  for (const reserved of ['www', 'api', 'admin', 'app', 'staging', 'mail', 'support', 'superadmin', 'merchant', 'terminal', 'm3pizza']) assert.match(lib.brandSlugError(reserved), /reserveret/);
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
  for (const path of ['/_next/static/x.js', '/fonts/inter/inter-latin-wght-normal.woff2', '/api/checkout/session', '/feedback', '/games/esmeralda', '/superadmin', '/terminal/login', '/terminal/orders', '/robots.txt', '/icon.png'])
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

test('#658 Merchant app and its same-origin APIs bypass storefront routing', () => {
  const { run } = middlewareFor();
  for (const host of ['esmeralda.orderfly.dk', 'other-brand.orderfly.dk', 'orderfly.dk']) {
    for (const path of ['/mapp', '/mapp/login', '/api/terminal/auth/session', '/api/terminal/orders']) {
      assert.deepEqual(run(`https://${host}${path}`), { kind: 'next' }, `${host}${path}`);
    }
  }
  assert.deepEqual(run('https://backend.internal/mapp', { 'x-forwarded-host': 'esmeralda.orderfly.dk' }), { kind: 'next' });
  assert.deepEqual(run('http://esmeralda.orderfly.dk/mapp'), { kind: 'redirect', url: 'https://esmeralda.orderfly.dk/mapp', status: 308 });
  // Prefixes are not aliases: an ordinary mapp-* location still belongs to this storefront.
  assert.deepEqual(run('https://esmeralda.orderfly.dk/mapp-amager'), { kind: 'rewrite', path: '/esmeralda/mapp-amager' });
  assert.deepEqual(run('https://esmeralda.orderfly.dk/mapplication'), { kind: 'rewrite', path: '/esmeralda/mapplication' });
});

test('#658 mapp is reserved as a brand but legacy location links retain their explicit brand prefix', async () => {
  assert.match(lib.brandSlugError('mapp'), /reserveret/);
  assert.equal(lib.brandSlugFromHost('mapp.orderfly.dk'), null);
  const f = fixture();
  const result = await f.brands.createOrUpdateBrand(null, formData({ ...brand, slug: 'mapp', ownerName: 'QA Owner', ownerEmail: 'qa@example.test' }));
  assert.equal(result.error, true);
  assert.match(result.message, /reserveret/);
  assert.equal(f.writes.length, 0);
  const { run } = middlewareFor();
  for (const suffix of [[], ['checkout'], ['checkout', 'confirmation']]) {
    const explicit = ['/esmeralda/mapp', ...suffix].join('/');
    assert.equal(lib.storefrontPath('esmeralda', true, 'mapp', ...suffix), explicit);
    assert.deepEqual(run(`https://esmeralda.orderfly.dk${explicit}`), { kind: 'next' });
  }
  assert.equal(lib.orderEntryUrl('orderfly.dk', 'esmeralda', 'mapp'), 'https://esmeralda.orderfly.dk/esmeralda/mapp');
});

test('/m3pizza/order on orderfly.dk continues on esmeralda.orderfly.dk; local hosts stay relative', () => {
  const { run } = middlewareFor();
  assert.deepEqual(run('https://orderfly.dk/m3pizza/order?deliveryMethod=delivery'), { kind: 'redirect', url: 'https://esmeralda.orderfly.dk/amager?deliveryMethod=delivery', status: 308 });
  assert.deepEqual(run('https://backend.internal/m3pizza/order', { 'x-forwarded-host': 'orderfly.dk' }), { kind: 'redirect', url: 'https://esmeralda.orderfly.dk/amager?deliveryMethod=pickup', status: 308 });
  assert.deepEqual(run('http://localhost:3000/m3pizza/order?deliveryMethod=delivery'), { kind: 'redirect', url: 'http://localhost:3000/esmeralda/amager?deliveryMethod=delivery', status: 308 });
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

// loadTs does not compile JSX; transpile pages and layouts with the React JSX runtime.
function loadTsx(file, mocks) {
  const ts = require('typescript'), fs = require('node:fs');
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}

test('#12 a suspended brand renders the neutral status page, never its storefront', async () => {
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

test('#12 the analytics collector accepts brand subdomain origins and still rejects look-alikes', () => {
  const { analyticsOriginAllowed } = loadTs('src/lib/analytics-origin.ts');
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const allowed = origin => analyticsOriginAllowed(new Request('http://0.0.0.0:8080/api/analytics/collect', { method: 'POST', headers: { origin } }));
    assert.equal(allowed('https://esmeralda.orderfly.dk'), true);
    assert.equal(allowed('https://orderfly.dk'), true);
    for (const origin of ['http://esmeralda.orderfly.dk', 'https://esmeralda.orderfly.dk:8443', 'https://a.b.orderfly.dk', 'https://admin.orderfly.dk',
      'https://esmeralda.orderfly.dk.evil.test', 'https://evilorderfly.dk', 'https://esmeralda.localhost', 'null'])
      assert.equal(allowed(origin), false, origin);
  } finally {
    process.env.NODE_ENV = env;
  }
});

test('#282 storefront paths drop the brand slug on its own subdomain and stay unchanged elsewhere', () => {
  const sub = host => lib.brandSlugFromHost(host) === 'esmeralda';
  // The brand subdomain, also locally, gets the short form.
  for (const host of ['esmeralda.orderfly.dk', 'esmeralda.localhost:3000']) {
    assert.equal(lib.storefrontPath('esmeralda', sub(host)), '/');
    assert.equal(lib.storefrontPath('esmeralda', sub(host), 'esmeralda-pizza-amager'), '/esmeralda-pizza-amager');
    assert.equal(lib.storefrontPath('esmeralda', sub(host), 'esmeralda-pizza-amager', 'checkout', 'confirmation'), '/esmeralda-pizza-amager/checkout/confirmation');
  }
  // orderfly.dk, www, localhost, reserved names and another brand's subdomain keep /{slug}/….
  for (const host of ['orderfly.dk', 'www.orderfly.dk', 'localhost:3000', 'admin.orderfly.dk', 'club.orderfly.dk', 'other-brand.orderfly.dk', '', null]) {
    assert.equal(lib.storefrontPath('esmeralda', sub(host)), '/esmeralda', String(host));
    assert.equal(lib.storefrontPath('esmeralda', sub(host), 'esmeralda-pizza-amager', 'checkout'), '/esmeralda/esmeralda-pizza-amager/checkout', String(host));
  }
  // A location named like the brand keeps the long form: the subdomain serves /{slug} as the brand page.
  assert.equal(lib.storefrontPath('esmeralda', true, 'esmeralda'), '/esmeralda/esmeralda');
  assert.equal(lib.brandSubdomainRewrite(lib.storefrontPath('esmeralda', true, 'esmeralda'), 'esmeralda'), null);
  // So does a location named like an app-wide path the middleware passes through.
  for (const location of ['feedback', 'games', 'api', 'merchant', 'terminal', 'verify', 'tracking']) {
    assert.equal(lib.storefrontPath('esmeralda', true, location), `/esmeralda/${location}`, location);
    assert.equal(lib.storefrontPath('esmeralda', true, location, 'checkout'), `/esmeralda/${location}/checkout`, location);
  }
  assert.equal(lib.storefrontPath('esmeralda', true, 'robots.txt'), '/esmeralda/robots.txt');
  // Every short path resolves to the same brand route as the long one.
  for (const segments of [[], ['esmeralda-pizza-amager'], ['esmeralda-pizza-amager', 'checkout', 'cancel']])
    assert.equal(lib.brandSubdomainRewrite(lib.storefrontPath('esmeralda', true, ...segments), 'esmeralda'), lib.storefrontPath('esmeralda', false, ...segments));
});

test('#282 the storefront layout reads the same page from the long and the short path', () => {
  for (const [long, short] of [['/esmeralda', '/'], ['/esmeralda/esmeralda-pizza-amager', '/esmeralda-pizza-amager'], ['/esmeralda/esmeralda-pizza-amager/checkout', '/esmeralda-pizza-amager/checkout'], ['/esmeralda/club/profil', '/club/profil']])
    assert.deepEqual(lib.storefrontSegments(short, 'esmeralda'), lib.storefrontSegments(long, 'esmeralda'), short);
  assert.deepEqual(lib.storefrontSegments('/esmeralda/esmeralda-pizza-amager/checkout', 'esmeralda'), ['esmeralda-pizza-amager', 'checkout']);
  assert.deepEqual(lib.storefrontSegments(null, 'esmeralda'), []);
});

test('#282 browser navigation (menu, Til kassen) uses the short path only on the brand subdomain', () => {
  const { browserStorefrontPath } = loadTs('src/hooks/use-storefront-path.ts');
  const at = (host, ...args) => { global.window = { location: { host } }; try { return browserStorefrontPath(...args); } finally { delete global.window; } };
  assert.equal(at('esmeralda.orderfly.dk', 'esmeralda', 'esmeralda-pizza-amager', 'checkout'), '/esmeralda-pizza-amager/checkout');
  assert.equal(at('orderfly.dk', 'esmeralda', 'esmeralda-pizza-amager', 'checkout'), '/esmeralda/esmeralda-pizza-amager/checkout');
  assert.equal(at('other.orderfly.dk', 'esmeralda', 'esmeralda-pizza-amager'), '/esmeralda/esmeralda-pizza-amager');
});

test('#282 old /{slug}/… links on the subdomain keep working, including Stripe returns, without a redirect', () => {
  const { run } = middlewareFor();
  const legacy = [
    '/esmeralda',
    '/esmeralda/esmeralda-pizza-amager?deliveryMethod=pickup',
    '/esmeralda/esmeralda-pizza-amager/checkout',
    '/esmeralda/esmeralda-pizza-amager/checkout/confirmation?order_id=ORD-1&session_id=cs_test_1&receipt_token=rt',
    '/esmeralda/esmeralda-pizza-amager/checkout/cancel?order_id=ORD-1&token=ct',
    '/esmeralda/checkout/confirmation?order_id=ORD-1&session_id=cs_test_1',
  ];
  for (const path of legacy) assert.deepEqual(run(`https://esmeralda.orderfly.dk${path}`), { kind: 'next' }, path);
  // The new short Stripe returns resolve to the same pages.
  assert.deepEqual(run('https://esmeralda.orderfly.dk/esmeralda-pizza-amager/checkout/confirmation?order_id=ORD-1&session_id=cs_test_1'), { kind: 'rewrite', path: '/esmeralda/esmeralda-pizza-amager/checkout/confirmation' });
  assert.deepEqual(run('https://esmeralda.orderfly.dk/esmeralda-pizza-amager/checkout/cancel?order_id=ORD-1&token=ct'), { kind: 'rewrite', path: '/esmeralda/esmeralda-pizza-amager/checkout/cancel' });
  // orderfly.dk/{slug}/… is untouched.
  assert.deepEqual(run('https://orderfly.dk/esmeralda/esmeralda-pizza-amager/checkout/confirmation?order_id=ORD-1'), { kind: 'next' });
});

test('#282 Stripe return addresses are short on the brand subdomain and unchanged on orderfly.dk', async () => {
  const { checkout } = require('../helpers/checkout-fixture.cjs');
  const urls = async origin => {
    const { result, sessionParams } = await checkout({ origin });
    assert.equal(result.success, true, result.error);
    return { success: sessionParams.success_url.split('?')[0], cancel: sessionParams.cancel_url.split('?')[0], query: [sessionParams.success_url.split('?')[1], sessionParams.cancel_url.split('?')[1]] };
  };
  // The fixture's brand slug is `brand` and its location slug `location`.
  const sub = await urls('https://brand.orderfly.dk');
  assert.equal(sub.success, 'https://brand.orderfly.dk/location/checkout/confirmation');
  assert.equal(sub.cancel, 'https://brand.orderfly.dk/location/checkout/cancel');
  assert.match(sub.query[0], /^order_id=ORD-TEST&session_id=\{CHECKOUT_SESSION_ID\}&receipt_token=[^&]+$/);
  assert.match(sub.query[1], /^order_id=ORD-TEST&token=[^&]+$/);
  for (const origin of ['https://orderfly.dk', 'https://example.test', 'https://other-brand.orderfly.dk', 'http://localhost:9002']) {
    const apex = await urls(origin);
    assert.equal(apex.success, `${origin}/brand/location/checkout/confirmation`, origin);
    assert.equal(apex.cancel, `${origin}/brand/location/checkout/cancel`, origin);
  }
});

test('#282 the public reviews page links back to the menu and to more reviews on the short path', async () => {
  const page = host => loadTsx('src/app/[brandSlug]/[locationSlug]/reviews/page.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); } },
    '@/lib/data/brand-location': { getBrandAndLocation: async () => ({ brand: { id: 'b', slug: 'esmeralda' }, location: { id: 'l', brandId: 'b', name: 'Amager' } }) },
    '@/lib/feedback/public-reviews': { readPublicReviews: async () => ({ reviews: [], next: 'r 2' }) },
    '@/components/feedback/public-reviews-view': { PublicReviewsView: () => null },
    '@/lib/server/storefront-path': loadTs('src/lib/server/storefront-path.ts', { 'server-only': {}, 'next/headers': { headers: async () => new Headers({ host }) } }),
  }).default({ params: Promise.resolve({ brandSlug: 'esmeralda', locationSlug: 'esmeralda-pizza-amager' }), searchParams: Promise.resolve({}) });
  const sub = (await page('esmeralda.orderfly.dk')).props;
  assert.equal(sub.menuHref, '/esmeralda-pizza-amager');
  assert.equal(sub.nextHref, '/esmeralda-pizza-amager/reviews?after=r%202');
  const apex = (await page('orderfly.dk')).props;
  assert.equal(apex.menuHref, '/esmeralda/esmeralda-pizza-amager');
  assert.equal(apex.nextHref, '/esmeralda/esmeralda-pizza-amager/reviews?after=r%202');
});

test('#282 "Bestil nu" on orderfly.dk continues on the brand subdomain; other hosts stay in the app', () => {
  const entry = (host, ...segments) => lib.orderEntryUrl(host, 'esmeralda', ...segments);
  for (const host of ['orderfly.dk', 'www.orderfly.dk', 'OrderFly.dk:443'])
    assert.equal(entry(host, 'esmeralda-pizza-amager'), 'https://esmeralda.orderfly.dk/esmeralda-pizza-amager', host);
  // Already on the subdomain: same short in-app path as before.
  assert.equal(entry('esmeralda.orderfly.dk', 'esmeralda-pizza-amager'), '/esmeralda-pizza-amager');
  // Local, preview and other hosts keep today's path.
  for (const host of ['localhost:3000', 'studio--orderfly.hosted.app', 'other.orderfly.dk', '', null])
    assert.equal(entry(host, 'esmeralda-pizza-amager'), '/esmeralda/esmeralda-pizza-amager', String(host));
  // A location that collides with an app path keeps the long form on the subdomain too.
  assert.equal(entry('orderfly.dk', 'feedback'), 'https://esmeralda.orderfly.dk/esmeralda/feedback');
  // A slug that cannot be a subdomain stays on orderfly.dk.
  assert.equal(lib.orderEntryUrl('orderfly.dk', 'admin', 'x'), '/admin/x');
});

test('#282 the "Bestil nu" sheet does a full jump to the subdomain on orderfly.dk and an in-app push elsewhere', () => {
  const run = (host, brandSlug) => {
    let state = null; const pushes = [], assigns = [], types = [];
    global.window = { location: { host, assign: url => assigns.push(url) } };
    try {
      const mod = loadTsx('src/components/modals/DeliveryMethodModal.tsx', {
        react: { useState: () => [state, next => { state = next; }], useEffect: fn => fn() },
        'react/jsx-runtime': require('react/jsx-runtime'),
        'next/navigation': { useRouter: () => ({ push: path => pushes.push(path) }) },
        '@/context/cart-context': { useCart: () => ({ location: null, setDeliveryType: type => types.push(type) }) },
        '@/components/ui/dialog': {}, '@/components/ui/button': {}, '@/components/storefront/OrderModal': { OrderModal: () => null },
        'lucide-react': {}, '@/hooks/use-storefront-path': loadTs('src/hooks/use-storefront-path.ts'),
      });
      mod.default();
      mod.openDeliveryModal({ brandSlug, locationSlug: 'esmeralda-pizza-amager', location: { deliveryTypes: ['pickup', 'delivery'] } });
      const sheet = mod.default();
      if (brandSlug === 'esmeralda') sheet.props.onDeliveryMethodSelected('delivery');
      // The generic dialog: [header, Afhentning, Levering].
      else sheet.props.children.props.children.filter(child => child.props?.onClick)[1].props.onClick();
      return { pushes, assigns, types };
    } finally { delete global.window; }
  };
  assert.deepEqual(run('orderfly.dk', 'esmeralda'), { pushes: [], assigns: ['https://esmeralda.orderfly.dk/esmeralda-pizza-amager?deliveryMethod=delivery'], types: ['delivery'] });
  assert.deepEqual(run('esmeralda.orderfly.dk', 'esmeralda'), { pushes: ['/esmeralda-pizza-amager?deliveryMethod=delivery'], assigns: [], types: ['delivery'] });
  assert.deepEqual(run('localhost:3000', 'esmeralda'), { pushes: ['/esmeralda/esmeralda-pizza-amager?deliveryMethod=delivery'], assigns: [], types: ['delivery'] });
  // The generic dialog of other brands follows the same rule.
  assert.deepEqual(run('orderfly.dk', 'cph-qa').assigns, ['https://cph-qa.orderfly.dk/esmeralda-pizza-amager?deliveryMethod=delivery']);
});
