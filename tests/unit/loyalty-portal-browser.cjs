// Actual customer-portal client components, compiled storefront CSS and the
// Esmeralda preset; the phase 1 API is answered by Playwright routes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();

const root = process.cwd();
let dir, server, browser, origin;
const TOKEN = 'c'.repeat(64);
const program = { name: 'Esmeralda Club', consentText: 'Ja tak, send mig nyhedsbrevet fra Esmeralda på e-mail.\nDu kan altid afmelde dig.', consentVersion: 'consent-1', termsVersion: 'terms-1' };

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loyalty-portal-'));
  const write = (name, code) => { const file = path.join(dir, name); fs.writeFileSync(file, code); return file; };
  const src = rel => JSON.stringify(path.join(root, 'src', rel));
  const navigation = write('navigation.js', `
    export const useRouter = () => ({ refresh(){ window.__refresh = (window.__refresh || 0) + 1; }, replace(){}, push(){} });
    export const usePathname = () => window.__pathname;`);
  const tracking = write('tracking.js', `export function mountBrandTracking(){ window.__mounted = (window.__mounted || 0) + 1; return () => {}; }`);
  const link = write('link.js', `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`);
  const analytics = write('analytics.js', `export const trackingConsent = () => ({ statistics: true, marketing: true }); export function clearRejectedTrackingCookies(){}`);
  const entry = write('entry.js', `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { SignupForm } from ${src('app/[brandSlug]/club/tilmeld/signup-form')};
    import { LoginFlow } from ${src('app/[brandSlug]/club/login/login-flow')};
    import { BrandTracking } from ${src('components/brand-tracking')};
    import { MemberCard } from ${src('app/[brandSlug]/club/member-card')};
    import { ProfileSettings } from ${src('app/[brandSlug]/club/profil/profile-settings')};
    import { ClubNav } from ${src('app/[brandSlug]/club/club-nav')};
    import { HomeScreenHint } from ${src('app/[brandSlug]/club/home-screen-hint')};
    const view = location.pathname.slice(1);
    window.__pathname = new URLSearchParams(location.search).get('path') || '/club';
    const node = view === 'signup' ? React.createElement(SignupForm, { slug: 'esmeralda', base: '/club', program: ${JSON.stringify(program)} })
      : view === 'login' ? React.createElement(LoginFlow, { slug: 'esmeralda', base: '/club', programName: 'Esmeralda Club', signedIn: false })
      : view === 'card' ? React.createElement(MemberCard, { slug: 'esmeralda', base: '/club', member: window.__member || ${JSON.stringify(null)} })
      : view === 'profile' ? React.createElement(ProfileSettings, { slug: 'esmeralda', base: '/club', programName: 'Esmeralda Club', member: { name: 'Anna Hansen', email: 'anna@example.com' },
          newsletter: { subscribed: new URLSearchParams(location.search).get('subscribed') !== 'no', consentVersion: 'consent-2', consentText: 'Ja tak til nyhedsbrevet på e-mail.' } })
      : view === 'nav' ? React.createElement(ClubNav, { base: '/club', programName: 'Esmeralda Club' })
      : view === 'hint' ? React.createElement(HomeScreenHint, { slug: 'esmeralda' })
      : view === 'tracking' ? React.createElement(BrandTracking, { brand: { id: 'b', slug: 'esmeralda', gtmContainerId: 'GTM-X' } })
      : React.createElement('h1', null, 'Mit stempelkort');
    createRoot(document.getElementById('root')).render(node);`);
  const loader = write('loader.js', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { 'next/navigation': navigation, 'next/link$': link, '@/lib/brand-tracking-frame': tracking, '@/lib/analytics': analytics, '@': path.join(root, 'src'),
      'react$': require.resolve('next/dist/compiled/react'), 'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
      'react-dom$': require.resolve('next/dist/compiled/react-dom'), 'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client') },
      extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /loyalty-portal-.*[\\/](entry|navigation|tracking|analytics|link)\.js$/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/commerce-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda"><div data-loyalty-portal class="mx-auto flex w-full max-w-md flex-col px-4"><main id="root"></main></div></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Answers the phase 1 API; `answers[path]` is a list of [status, body] or 'abort', used in order.
async function open(view, { width = 390, hash = '', answers = {}, clock, init, device = {} } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, ...device });
  if (clock) await page.clock.install({ time: clock });
  if (init) await page.addInitScript(init.fn, init.arg);
  const calls = [];
  await page.route('**/api/loyalty/esmeralda/*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    calls.push({ name, method: route.request().method(), body: route.request().postDataJSON(), url: page.url(), contentType: route.request().headers()['content-type'] });
    const answer = (answers[name] || []).shift() || [200, { ok: true }];
    if (answer === 'abort') return route.abort('internetdisconnected');
    if (typeof answer === 'function') return route.fulfill(await answer());
    await route.fulfill({ status: answer[0], contentType: 'application/json', body: JSON.stringify(answer[1]) });
  });
  await page.goto(`${origin}/${view}${hash}`);
  return { page, calls };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const width of [390, 1440]) test(`sign-up needs both unticked boxes, sends the shown versions and answers neutrally at ${width}px`, async () => {
  const { page, calls } = await open('signup', { width });
  try {
    const consent = page.getByRole('checkbox', { name: /nyhedsbrevet fra Esmeralda/ }), terms = page.getByRole('checkbox', { name: 'Jeg accepterer vilkårene for Esmeralda Club.' });
    assert.equal(await consent.getAttribute('aria-checked'), 'false');
    assert.equal(await terms.getAttribute('aria-checked'), 'false');
    await page.getByRole('button', { name: 'Bliv medlem' }).click();
    await page.getByText('Skriv dit navn.').waitFor();
    await page.getByText('Du skal give samtykke til nyhedsbrevet for at blive medlem.').waitFor();
    await page.getByText('Du skal acceptere vilkårene for at blive medlem.').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'club-name');
    await page.getByLabel('Navn', { exact: true }).fill('Anna Hansen');
    await page.getByLabel('E-mail', { exact: true }).fill('anna@example.com');
    await terms.click();
    await page.getByRole('button', { name: 'Bliv medlem' }).click();
    await page.getByText('Du skal give samtykke til nyhedsbrevet for at blive medlem.').waitFor();
    assert.equal(calls.length, 0);
    assert.equal(await page.getByRole('link', { name: 'Læs vilkårene' }).getAttribute('href'), '/club/vilkaar');
    await consent.click();
    await page.getByRole('button', { name: 'Bliv medlem' }).click();
    await page.getByRole('heading', { name: 'Tjek din e-mail' }).waitFor();
    assert.deepEqual(calls.map(c => [c.name, c.method, c.contentType]), [['signup', 'POST', 'application/json']]);
    assert.deepEqual(calls[0].body, { name: 'Anna Hansen', email: 'anna@example.com', newsletterConsent: true, termsAccepted: true, consentVersion: 'consent-1', termsVersion: 'terms-1' });
    await page.getByText('Linket virker i 15 minutter og kan kun bruges én gang.').waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('changed texts ask for fresh ticks and rate limits are explained', async () => {
  const { page } = await open('signup', { answers: { signup: [[409, { error: 'program_changed' }], [429, { error: 'rate_limited' }]] } });
  try {
    await page.getByLabel('Navn', { exact: true }).fill('Anna');
    await page.getByLabel('E-mail', { exact: true }).fill('anna@example.com');
    await page.getByRole('checkbox', { name: /nyhedsbrevet/ }).click();
    await page.getByRole('checkbox', { name: /accepterer vilkårene/ }).click();
    await page.getByRole('button', { name: 'Bliv medlem' }).click();
    await page.getByRole('alert').filter({ hasText: 'Teksterne er blevet opdateret' }).waitFor();
    assert.equal(await page.evaluate(() => window.__refresh), 1);
    await page.getByRole('button', { name: 'Bliv medlem' }).click();
    await page.getByRole('alert').filter({ hasText: 'Du har prøvet mange gange' }).waitFor();
  } finally { await page.close(); }
});

for (const width of [390, 1440]) test(`a login link is requested by e-mail with a neutral answer at ${width}px`, async () => {
  const { page, calls } = await open('login', { width });
  try {
    await page.getByLabel('E-mail', { exact: true }).fill('ukendt');
    await page.getByRole('button', { name: 'Send login-link' }).click();
    await page.getByRole('alert').filter({ hasText: 'Skriv en gyldig e-mail.' }).waitFor();
    assert.equal(calls.length, 0);
    await page.getByLabel('E-mail', { exact: true }).fill('anna@example.com');
    await page.getByRole('button', { name: 'Send login-link' }).click();
    await page.getByRole('heading', { name: 'Tjek din e-mail' }).waitFor();
    assert.deepEqual(calls.map(c => [c.name, c.body]), [['login-link', { email: 'anna@example.com' }]]);
    await page.getByRole('button', { name: /Prøv igen/ }).click();
    await page.getByLabel('E-mail', { exact: true }).waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('the link from the mail is removed from the address before it is verified, then opens the card', async () => {
  const { page, calls } = await open('login', { hash: `#token=${TOKEN}` });
  try {
    await page.waitForURL(`${origin}/club`);
    await page.getByRole('heading', { name: 'Mit stempelkort' }).waitFor();
    assert.deepEqual(calls.map(c => [c.name, c.body]), [['verify', { token: TOKEN }]]);
    assert.equal(calls[0].url, `${origin}/login`);
  } finally { await page.close(); }
});

for (const [error, heading, text] of [['link_expired', 'Linket er udløbet', '15 minutter'], ['link_invalid', 'Linket virker ikke længere', 'kun bruges én gang']])
  test(`${error} explains itself and offers a new link`, async () => {
    const { page, calls } = await open('login', { hash: `#token=${TOKEN}`, answers: { verify: [[410, { error }]] } });
    try {
      await page.getByRole('heading', { name: heading }).waitFor();
      await page.getByText(text).waitFor();
      assert.equal(new URL(page.url()).hash, '');
      await page.getByRole('button', { name: 'Send mig et nyt link' }).click();
      await page.getByLabel('E-mail', { exact: true }).waitFor();
      assert.equal(calls.length, 1);
    } finally { await page.close(); }
  });

test('a malformed link is rejected without a call; a lost connection can retry the same link', async () => {
  const bad = await open('login', { hash: '#token=abc' });
  try {
    await bad.page.getByRole('heading', { name: 'Linket virker ikke længere' }).waitFor();
    assert.equal(bad.calls.length, 0);
  } finally { await bad.page.close(); }
  const { page, calls } = await open('login', { hash: `#token=${TOKEN}`, answers: { verify: ['abort'] } });
  try {
    await page.getByRole('heading', { name: 'Vi kunne ikke logge dig ind' }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Ingen forbindelse' }).waitFor();
    await page.getByRole('button', { name: 'Prøv igen' }).click();
    await page.waitForURL(`${origin}/club`);
    assert.deepEqual(calls.map(c => c.body.token), [TOKEN, TOKEN]);
  } finally { await page.close(); }
});

test('brand tracking stays off on portal pages and still runs in the storefront', async () => {
  for (const [pathname, mounted] of [['/club/login', undefined], ['/esmeralda/club', undefined], ['/esmeralda/amager', 1], ['/', 1]]) {
    const { page } = await open(`tracking?path=${encodeURIComponent(pathname)}`);
    try {
      await page.waitForFunction(() => document.readyState === 'complete');
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.__mounted), mounted, pathname);
    } finally { await page.close(); }
  }
});

const QRCode = require('qrcode');
const NOW = Date.parse('2026-10-20T10:00:00Z');
const member = { program: { name: 'Esmeralda Club', active: true, rewardDescription: 'Gratis pizza', terms: 'Vilkår' },
  member: { name: 'Anna Hansen', email: 'anna@example.com', joinedAt: NOW },
  card: { stamps: 5, stampsRequired: 8, expiresAt: Date.parse('2027-04-20T10:00:00Z'), rewardDescription: 'Gratis pizza' },
  rewards: [{ id: 'r1', description: 'Gratis pizza', expiresAt: Date.parse('2027-01-20T10:00:00Z') }], history: [], newsletter: { subscribed: true, consentVersion: 'consent-1' } };
// A QR answer stamped with the server's own clock (Date header), independent of the phone's clock.
const qrAnswer = (token, serverNow) => () => ({ status: 200, contentType: 'application/json', headers: { date: new Date(serverNow).toUTCString() },
  body: JSON.stringify({ token, expiresAt: serverNow + 60_000 }) });
// The modules of the code (the dark path), compared independently of how the browser serialises SVG.
const modules = svg => /stroke="#000000" d="([^"]+)"/.exec(svg)[1];
const qrSvg = async token => modules(await QRCode.toString(token, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } }));
const withMember = (m = member) => ({ fn: value => { window.__member = value; }, arg: m });

for (const width of [390, 1440]) test(`the card shows stamps X of N, the next reward, rewards and the expiry date at ${width}px`, async () => {
  const { page } = await open('card', { width, init: withMember(), answers: { qr: [qrAnswer('a'.repeat(64), NOW)] } });
  try {
    await page.getByRole('img', { name: '5 af 8 stempler' }).waitFor();
    assert.equal(await page.locator('[data-stamp="filled"]').count(), 5);
    assert.equal(await page.locator('[data-stamp="empty"]').count(), 3);
    await page.getByText('3 stempler til gratis pizza').waitFor();
    await page.getByText('Dine stempler udløber, hvis du ikke har fået et nyt stempel inden 20. april 2027.').waitFor();
    const reward = page.getByRole('listitem');
    await reward.getByText('Gratis pizza').waitFor();
    await reward.getByText('Udløber 20. januar 2027').waitFor();
    await reward.getByText('Vis QR-koden ved kassen for at indløse').waitFor();
    await page.getByRole('img', { name: 'QR-kode til kassen' }).waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('a card without stamps or rewards and a closed program say so plainly', async () => {
  const quiet = { ...member, program: { ...member.program, active: false }, card: { ...member.card, stamps: 0, expiresAt: null }, rewards: [] };
  const { page } = await open('card', { init: withMember(quiet) });
  try {
    await page.getByRole('img', { name: '0 af 8 stempler' }).waitFor();
    await page.getByText('Klubben giver ikke nye stempler lige nu. Dine stempler og belønninger er gemt.').waitFor();
    assert.equal(await page.getByText(/udløber, hvis du ikke/).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Dine belønninger' }).count(), 0);
  } finally { await page.close(); }
});

test('the QR code encodes the backend token, renews before expiry and refreshes the card', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const slow = async () => { await held; return qrAnswer('b'.repeat(64), NOW + 45_000)(); };
  const { page, calls } = await open('card', { clock: NOW, init: withMember(), answers: { qr: [qrAnswer('a'.repeat(64), NOW), slow] } });
  try {
    const qr = page.getByRole('img', { name: 'QR-kode til kassen' });
    await qr.waitFor();
    assert.equal(modules(await qr.innerHTML()), await qrSvg('a'.repeat(64)));
    await page.clock.runFor(46_000);
    // The backend revokes the old code when it issues the new one, so the old code is gone while renewing.
    await page.getByRole('status').filter({ hasText: 'Henter QR-kode…' }).waitFor();
    assert.equal(await qr.count(), 0);
    release();
    await page.waitForFunction(() => window.__refresh === 1);
    assert.equal(modules(await qr.innerHTML()), await qrSvg('b'.repeat(64)));
    assert.deepEqual(calls.map(c => [c.name, c.method]), [['qr', 'GET'], ['qr', 'GET']]);
  } finally { await page.close(); }
});

test('without a connection the code disappears at expiry, shows a retry button and never an old code', async () => {
  const { page } = await open('card', { clock: NOW, init: withMember(), answers: { qr: [qrAnswer('a'.repeat(64), NOW), ...Array(20).fill('abort')] } });
  try {
    await page.getByRole('img', { name: 'QR-kode til kassen' }).waitFor();
    await page.clock.runFor(46_000);
    // A failed renewal may still have revoked the old code, so it is not shown again.
    await page.getByRole('alert').filter({ hasText: 'Ingen forbindelse – QR-koden kan ikke vises' }).waitFor();
    assert.equal(await page.getByRole('img', { name: 'QR-kode til kassen' }).count(), 0);
    await page.unroute('**/api/loyalty/esmeralda/*');
    await page.route('**/api/loyalty/esmeralda/qr', route => route.fulfill(qrAnswer('c'.repeat(64), NOW + 58_000)()));
    await page.getByRole('button', { name: 'Prøv igen' }).click();
    await page.getByRole('img', { name: 'QR-kode til kassen' }).waitFor();
  } finally { await page.close(); }
});

for (const skew of [-600_000, 600_000]) test(`a phone clock ${skew > 0 ? 'ahead' : 'behind'} by 10 minutes cannot keep a code on screen longer`, async () => {
  const { page } = await open('card', { clock: NOW + skew, init: withMember(), answers: { qr: [qrAnswer('a'.repeat(64), NOW), ...Array(20).fill('abort')] } });
  try {
    const qr = page.getByRole('img', { name: 'QR-kode til kassen' });
    await qr.waitFor();
    const left = await page.evaluate(() => Number(document.querySelector('[data-qr-valid-until]').dataset.qrValidUntil) - Date.now());
    assert.ok(left <= 57_000 && left > 50_000, String(left));
    await page.clock.runFor(58_000);
    await page.getByRole('alert').waitFor();
    assert.equal(await qr.count(), 0);
  } finally { await page.close(); }
});

test('an expired session sends the customer to login', async () => {
  const { page } = await open('card', { init: withMember(), answers: { qr: [[401, { error: 'unauthorized' }]] } });
  try {
    await page.waitForURL(`${origin}/club/login`);
  } finally { await page.close(); }
});

test('the screen stays on and the wake lock is taken again after the app returns', async () => {
  const wakeLock = { fn: () => {
    window.__locks = [];
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { const lock = { released: false, release: async () => { lock.released = true; } }; window.__locks.push(lock); return lock; } } });
  } };
  const { page } = await open('card', { init: withMember(), answers: { qr: [qrAnswer('a'.repeat(64), Date.now()), qrAnswer('b'.repeat(64), Date.now())] } });
  await page.addInitScript(wakeLock.fn);
  try {
    await page.reload();
    await page.getByRole('img', { name: 'QR-kode til kassen' }).waitFor();
    await page.waitForFunction(() => window.__locks.length === 1);
    // The browser releases the lock while hidden; coming back takes a new one.
    await page.evaluate(() => { window.__locks[0].released = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__locks.length === 2);
    // While a lock is held, returning does not stack another.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__locks.length), 2);
  } finally { await page.close(); }
});

for (const width of [390, 1440]) test(`the profile unsubscribes and resubscribes the newsletter and keeps the membership at ${width}px`, async () => {
  const { page, calls } = await open('profile', { width, answers: { consent: [[200, { subscribed: false }], [200, { subscribed: true }]] } });
  try {
    await page.getByText('Anna Hansen').waitFor();
    await page.getByText('anna@example.com').waitFor();
    await page.getByText('Du beholder dit medlemskab, dine stempler og dine belønninger, selv om du afmelder nyhedsbrevet.').waitFor();
    await page.getByRole('button', { name: 'Afmeld nyhedsbrevet' }).click();
    await page.getByRole('status').filter({ hasText: 'Du er afmeldt nyhedsbrevet. Dit medlemskab og dine stempler er bevaret.' }).waitFor();
    await page.getByText('Ja tak til nyhedsbrevet på e-mail.').waitFor();
    await page.getByRole('button', { name: 'Tilmeld nyhedsbrevet' }).click();
    await page.getByRole('status').filter({ hasText: 'Du er tilmeldt nyhedsbrevet.' }).waitFor();
    assert.deepEqual(calls.map(c => [c.name, c.body]), [['consent', { subscribed: false }], ['consent', { subscribed: true, consentVersion: 'consent-2' }]]);
    assert.equal(await page.getByRole('link', { name: 'Læs vilkårene for Esmeralda Club' }).getAttribute('href'), '/club/vilkaar');
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('changed consent text is reloaded before resubscribing', async () => {
  const { page } = await open('profile?subscribed=no', { answers: { consent: [[409, { error: 'program_changed' }]] } });
  try {
    await page.getByRole('button', { name: 'Tilmeld nyhedsbrevet' }).click();
    await page.getByRole('alert').filter({ hasText: 'Teksten er blevet opdateret' }).waitFor();
    assert.equal(await page.evaluate(() => window.__refresh), 1);
  } finally { await page.close(); }
});

test('deleting asks for confirmation, explains the loss and then confirms the deletion', async () => {
  const { page, calls } = await open('profile');
  try {
    await page.getByRole('button', { name: 'Slet medlemskab' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Slet dit medlemskab?' });
    await dialog.getByText('Dine stempler og belønninger går tabt og kan ikke genskabes.').waitFor();
    await dialog.getByRole('button', { name: 'Behold medlemskab' }).click();
    assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Slet medlemskab' }).click();
    await page.getByRole('button', { name: 'Ja, slet mit medlemskab' }).click();
    await page.getByRole('heading', { name: 'Dit medlemskab er slettet' }).waitFor();
    assert.deepEqual(calls.map(c => [c.name, c.body]), [['delete', { confirm: true }]]);
  } finally { await page.close(); }
});

test('logging out returns to the portal start; an expired session goes to login', async () => {
  const out = await open('profile');
  try {
    await out.page.getByRole('button', { name: 'Log ud' }).click();
    await out.page.waitForURL(`${origin}/club`);
    assert.deepEqual(out.calls.map(c => [c.name, c.method]), [['logout', 'POST']]);
  } finally { await out.page.close(); }
  const { page } = await open('profile', { answers: { consent: [[401, { error: 'unauthorized' }]] } });
  try {
    await page.getByRole('button', { name: 'Afmeld nyhedsbrevet' }).click();
    await page.waitForURL(`${origin}/club/login`);
  } finally { await page.close(); }
});

test('the portal menu marks the current page on the subdomain and on orderfly.dk/{slug}', async () => {
  for (const [pathname, current] of [['/club', 'Kort'], ['/club/historik', 'Historik'], ['/esmeralda/club/profil', 'Profil']]) {
    const { page } = await open(`nav?path=${encodeURIComponent(pathname)}`);
    try {
      const nav = page.getByRole('navigation', { name: 'Menu for Esmeralda Club' });
      await nav.waitFor();
      assert.deepEqual(await nav.getByRole('link').evaluateAll(links => links.map(l => [l.textContent, l.getAttribute('href'), l.getAttribute('aria-current')])),
        [['Kort', '/club', current === 'Kort' ? 'page' : null], ['Historik', '/club/historik', current === 'Historik' ? 'page' : null], ['Profil', '/club/profil', current === 'Profil' ? 'page' : null]]);
    } finally { await page.close(); }
  }
});

const iphone = { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const android = { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' };

test('the home-screen guide shows once on phones and stays closed', async () => {
  const { page } = await open('hint', { device: iphone });
  try {
    await page.getByRole('heading', { name: 'Læg kortet på din hjemmeskærm' }).waitFor();
    await page.getByText('Tryk på Del-knappen i Safari, og vælg »Føj til hjemmeskærm«.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Luk' }).click();
    assert.equal(await page.getByRole('heading', { name: 'Læg kortet på din hjemmeskærm' }).count(), 0);
    await page.reload();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole('heading', { name: 'Læg kortet på din hjemmeskærm' }).count(), 0);
  } finally { await page.close(); }
  const droid = await open('hint', { device: android });
  try {
    await droid.page.getByText('Åbn browserens menu (⋮), og vælg »Føj til startskærm«.', { exact: false }).waitFor();
    // Chrome's own install prompt replaces the manual steps when offered.
    await droid.page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.__prompted = true; }; window.dispatchEvent(e); });
    await droid.page.getByRole('button', { name: 'Føj til hjemmeskærm' }).click();
    assert.equal(await droid.page.evaluate(() => window.__prompted), true);
    await droid.page.waitForFunction(() => !document.querySelector('#club-home-screen'));
  } finally { await droid.page.close(); }
  const desktop = await open('hint', { width: 1440 });
  try {
    await desktop.page.waitForTimeout(200);
    assert.equal(await desktop.page.getByRole('heading', { name: 'Læg kortet på din hjemmeskærm' }).count(), 0);
  } finally { await desktop.page.close(); }
});
