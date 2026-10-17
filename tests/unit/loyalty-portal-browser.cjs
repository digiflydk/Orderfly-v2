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
  const analytics = write('analytics.js', `export const trackingConsent = () => ({ statistics: true, marketing: true }); export function clearRejectedTrackingCookies(){}`);
  const entry = write('entry.js', `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { SignupForm } from ${src('app/[brandSlug]/club/tilmeld/signup-form')};
    import { LoginFlow } from ${src('app/[brandSlug]/club/login/login-flow')};
    import { BrandTracking } from ${src('components/brand-tracking')};
    const view = location.pathname.slice(1);
    window.__pathname = new URLSearchParams(location.search).get('path') || '/club';
    const node = view === 'signup' ? React.createElement(SignupForm, { slug: 'esmeralda', base: '/club', program: ${JSON.stringify(program)} })
      : view === 'login' ? React.createElement(LoginFlow, { slug: 'esmeralda', base: '/club', programName: 'Esmeralda Club', signedIn: false })
      : view === 'tracking' ? React.createElement(BrandTracking, { brand: { id: 'b', slug: 'esmeralda', gtmContainerId: 'GTM-X' } })
      : React.createElement('h1', null, 'Mit stempelkort');
    createRoot(document.getElementById('root')).render(node);`);
  const loader = write('loader.js', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { 'next/navigation': navigation, '@/lib/brand-tracking-frame': tracking, '@/lib/analytics': analytics, '@': path.join(root, 'src'),
      'react$': require.resolve('next/dist/compiled/react'), 'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
      'react-dom$': require.resolve('next/dist/compiled/react-dom'), 'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client') },
      extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /loyalty-portal-.*[\\/](entry|navigation|tracking|analytics)\.js$/, use: [loader] }] },
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
async function open(view, { width = 390, hash = '', answers = {} } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const calls = [];
  await page.route('**/api/loyalty/esmeralda/*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    calls.push({ name, method: route.request().method(), body: route.request().postDataJSON(), url: page.url(), contentType: route.request().headers()['content-type'] });
    const answer = (answers[name] || []).shift() || [200, { ok: true }];
    if (answer === 'abort') return route.abort('internetdisconnected');
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
