// Actual counter view (stamp-card phase 3) in Chromium at tablet and phone sizes.
// The merchant APIs and the camera are synthetic; no production data is touched.
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
const TOKEN = 'c'.repeat(64);
const NOW = Date.parse('2026-10-20T10:00:00Z');
let dir, server, browser, origin;

const BRANDS = [
  { id: 'b', name: 'Esmeralda', locations: [{ id: 'l1', name: 'Amager' }, { id: 'l2', name: 'Vesterbro' }],
    program: { active: true, name: 'Esmeralda Club', counterChannels: ['dine_in', 'takeaway'], idleMinutes: 1 } },
  { id: 'off', name: 'Lukket', locations: [{ id: 'l3', name: 'Nord' }],
    program: { active: false, name: 'Lukket Club', counterChannels: ['dine_in'], idleMinutes: 5 } },
];
const lookup = (changes = {}) => ({
  via: 'qr', member: { id: 'm1', name: 'Anna Jensen', maskedEmail: 'a***@example.com' },
  card: { stamps: 5, stampsRequired: 8, expiresAt: NOW + 9e9 },
  rewards: [{ id: 'r1', description: 'Gratis pizza', expiresAt: NOW + 5e9, redeemableHere: true }],
  program: { active: true, name: 'Esmeralda Club', counterChannels: ['dine_in', 'takeaway'], minimumAmountOre: 10000, discountedOrdersQualify: false },
  permissions: { redeem: true, correct: true }, ...changes,
});

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loyalty-counter-'));
  const write = (name, code) => { const file = path.join(dir, name); fs.writeFileSync(file, code); return file; };
  const link = write('link.js', `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`);
  const entry = write('entry.js', `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { CounterView } from ${JSON.stringify(path.join(root, 'src/app/merchant/stamp-card/counter-view'))};
    const props = Object.assign({ employee: { id: 'emp-1', name: 'Kasse Karin' }, brands: ${JSON.stringify(BRANDS)}, adminHref: null }, window.__props || {});
    createRoot(document.getElementById('root')).render(React.createElement(CounterView, props));`);
  const loader = write('loader.js', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js', publicPath: '/' },
    resolve: { alias: { '@/components/superadmin/admin-link': link, '@': path.join(root, 'src'),
      'react$': require.resolve('next/dist/compiled/react'), 'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
      'react-dom$': require.resolve('next/dist/compiled/react-dom'), 'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client') },
      extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /loyalty-counter-.*[\\/](entry|link)\.js$/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    const file = path.join(dir, path.basename(req.url));
    if (req.url.endsWith('.js') && fs.existsSync(file)) { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(file)); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div class="admin-shell min-h-screen bg-background"><div id="root"></div></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// Opens the counter with a synthetic camera that "sees" window.__qr, and records API calls.
async function open({ width = 1180, height = 820, props, api = {}, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  await page.addInitScript(({ props, init }) => {
    if (props) window.__props = props;
    navigator.mediaDevices.getUserMedia = async () => { const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48; canvas.getContext('2d').fillRect(0, 0, 64, 48); return canvas.captureStream(); };
    window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { return window.__qr ? [{ rawValue: window.__qr }] : []; } };
    if (init) new Function(init)();
  }, { props, init });
  const calls = [];
  const replies = { lookup: () => [200, lookup()], stamp: () => [200, { stamps: 6, stampsRequired: 8, rewardsEarned: 0, cardId: 'c1', replayed: false }],
    redeem: () => [200, { rewardId: 'r1', description: 'Gratis pizza', replayed: false }], correct: () => [200, { stamps: 7, stampsRequired: 8, cardId: 'c1', replayed: false }], ...api };
  await page.route('**/api/merchant/loyalty/*', async route => {
    const name = route.request().url().split('/').pop(), body = JSON.parse(route.request().postData());
    calls.push([name, body]);
    const reply = await replies[name](body, calls);
    if (reply === 'abort') return route.abort();
    await route.fulfill({ status: reply[0], contentType: 'application/json', body: JSON.stringify(reply[1]) });
  });
  await page.route('**/api/admin/session', async route => {
    calls.push(['session:' + route.request().method(), route.request().postData() ? JSON.parse(route.request().postData()) : null]);
    const reply = api.session?.(route.request()) ?? [200, { ok: true }];
    await route.fulfill({ status: reply[0], contentType: 'application/json', body: JSON.stringify(reply[1]) });
  });
  await page.goto(`${origin}/merchant/stamp-card`);
  return { page, calls, close: () => context.close() };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function scan(page, value = TOKEN) {
  await page.evaluate(v => { window.__qr = v; }, value);
  await page.getByRole('button', { name: 'Scan QR-kode' }).click();
}

for (const [width, height] of [[1180, 820], [820, 1180], [390, 844]]) test(`scan, give a stamp in three taps and return to start at ${width}x${height}`, async () => {
  const { page, calls, close } = await open({ width, height });
  try {
    assert.equal(await page.getByTestId('counter-employee').textContent(), 'Kasse Karin');
    await scan(page);
    await page.getByTestId('member-name').waitFor();
    assert.equal(await page.getByTestId('member-stamps').textContent(), 'Stempler 5 af 8');
    await page.getByText('Gratis pizza').waitFor();
    assert.deepEqual(calls[0], ['lookup', { brandId: 'b', locationId: 'l1', qrToken: TOKEN }]);
    await page.getByRole('button', { name: 'Giv stempel' }).click();
    await page.getByRole('button', { name: 'Dine-in' }).click();
    await page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('149,50');
    await page.getByRole('button', { name: 'Bekræft' }).click();
    await page.getByText('Stempel givet – 6 af 8').waitFor();
    const [, stamp] = calls.find(([name]) => name === 'stamp');
    assert.match(stamp.idempotencyKey, /^[a-f0-9]{64}$/);
    assert.deepEqual({ ...stamp, idempotencyKey: 'k' }, { brandId: 'b', locationId: 'l1', memberId: 'm1', channel: 'dine_in', amountOre: 14950, discountUsed: false, via: 'qr', idempotencyKey: 'k' });
    assert.ok(await noOverflow(page));
    await page.clock.runFor(4100);
    await page.getByRole('button', { name: 'Scan QR-kode' }).waitFor();
  } finally { await close(); }
});

test('only dine-in and takeaway can be chosen; below minimum and discounted purchases cannot be confirmed', async () => {
  const { page, calls, close } = await open();
  try {
    await scan(page);
    await page.getByRole('button', { name: 'Giv stempel' }).click();
    const channels = await page.getByRole('group', { name: 'Kanal' }).getByRole('button').allTextContents();
    assert.deepEqual(channels, ['Dine-in', 'Takeaway']);
    assert.equal(await page.getByText(/Wolt|Uber/).count(), 0);
    await page.getByRole('button', { name: 'Takeaway' }).click();
    await page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('99,99');
    await page.getByRole('alert').filter({ hasText: 'Beløbet er under 100 kr. og giver ikke stempel.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bekræft' }).isDisabled(), true);
    await page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('100');
    assert.equal(await page.getByRole('button', { name: 'Bekræft' }).isDisabled(), false);
    await page.getByLabel('Rabat eller kampagne brugt').check();
    await page.getByRole('alert').filter({ hasText: 'Køb med rabat eller kampagne giver ikke stempel.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bekræft' }).isDisabled(), true);
    assert.equal(calls.filter(([name]) => name === 'stamp').length, 0);
  } finally { await close(); }
});

test('a double tap sends one stamp, and an uncertain failure only retries the same request', async () => {
  let attempt = 0;
  const { page, calls, close } = await open({ props: { brands: [{ ...BRANDS[0], program: { ...BRANDS[0].program, counterChannels: ['takeaway'] } }] },
    api: { lookup: () => [200, lookup({ program: { ...lookup().program, counterChannels: ['takeaway'] } })],
      stamp: async () => (++attempt === 1 ? 'abort' : [200, { stamps: 0, stampsRequired: 8, rewardsEarned: 1, cardId: 'c2', replayed: true }]) } });
  try {
    await scan(page);
    await page.getByRole('button', { name: 'Giv stempel' }).click();
    // A single channel is preselected: amount and confirm are the only taps.
    assert.equal(await page.getByRole('button', { name: 'Takeaway' }).getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('120');
    await page.getByRole('button', { name: 'Bekræft' }).dblclick();
    await page.getByRole('alert').filter({ hasText: 'Ingen forbindelse. Prøv igen.' }).waitFor();
    assert.equal(calls.filter(([name]) => name === 'stamp').length, 1);
    assert.equal(await page.getByLabel('Købsbeløb inkl. moms (kr.)').isDisabled(), true);
    assert.equal(await page.getByText(/Stempel givet|Kortet er fyldt/).count(), 0);
    await page.getByRole('button', { name: 'Prøv igen' }).click();
    await page.getByText('Kortet er fyldt – belønning optjent').waitFor();
    await page.getByText('Nyt kort: 0 af 8').waitFor();
    const stamps = calls.filter(([name]) => name === 'stamp').map(([, body]) => body);
    assert.equal(stamps.length, 2); assert.deepEqual(stamps[0], stamps[1]);
  } finally { await close(); }
});

test('expired or foreign QR codes and unknown e-mails show clear messages', async () => {
  const { page, calls, close } = await open({ api: { lookup: body => body.qrToken ? [410, { error: 'qr_invalid' }] : [404, { error: 'member_not_found' }] } });
  try {
    await scan(page, 'https://esmeraldapizza.dk/club');
    await page.getByText('Det er ikke en stempelkort-kode.').waitFor();
    assert.equal(calls.length, 0);
    await page.evaluate(v => { window.__qr = v; }, TOKEN);
    await page.getByRole('alert').filter({ hasText: 'QR-koden er udløbet. Bed kunden opdatere siden.' }).waitFor();
    await page.getByRole('button', { name: 'Søg kunde på e-mail' }).click();
    await page.getByLabel('Kundens e-mail').fill('ukendt@example.com');
    await page.getByRole('button', { name: 'Søg' }).click();
    await page.getByRole('alert').filter({ hasText: 'Kunden findes ikke.' }).waitFor();
  } finally { await close(); }
});

test('e-mail search shows the masked e-mail and stamps are sent as via search', async () => {
  const { page, calls, close } = await open({ api: { lookup: () => [200, lookup({ via: 'search' })] } });
  try {
    await page.getByRole('button', { name: 'Søg kunde på e-mail' }).click();
    await page.getByLabel('Kundens e-mail').fill('anna@example.com');
    await page.getByRole('button', { name: 'Søg' }).click();
    await page.getByText('a***@example.com').waitFor();
    assert.deepEqual(calls[0], ['lookup', { brandId: 'b', locationId: 'l1', email: 'anna@example.com' }]);
    await page.getByRole('button', { name: 'Giv stempel' }).click();
    await page.getByRole('button', { name: 'Dine-in' }).click();
    await page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('250');
    await page.getByRole('button', { name: 'Bekræft' }).click();
    await page.getByText('Stempel givet – 6 af 8').waitFor();
    assert.equal(calls.find(([name]) => name === 'stamp')[1].via, 'search');
  } finally { await close(); }
});

test('redemption needs a valid reward, the permission and a confirmation; double taps redeem once', async () => {
  const { page, calls, close } = await open({ api: { redeem: () => new Promise(resolve => setTimeout(() => resolve([200, { rewardId: 'r1', description: 'Gratis pizza' }]), 50)) } });
  try {
    await scan(page);
    await page.getByRole('button', { name: 'Indløs belønning' }).click();
    await page.getByRole('button', { name: 'Indløs', exact: true }).click();
    await page.getByRole('button', { name: 'Bekræft indløsning' }).dblclick();
    await page.getByText('Belønning indløst').waitFor();
    const redeems = calls.filter(([name]) => name === 'redeem');
    assert.equal(redeems.length, 1);
    assert.deepEqual({ ...redeems[0][1], idempotencyKey: 'k' }, { brandId: 'b', locationId: 'l1', rewardId: 'r1', via: 'qr', idempotencyKey: 'k' });
  } finally { await close(); }
  for (const changes of [{ permissions: { redeem: false, correct: false } }, { rewards: [{ id: 'r2', description: 'Gratis pizza', expiresAt: NOW + 5e9, redeemableHere: false }] }]) {
    const view = await open({ api: { lookup: () => [200, lookup(changes)] } });
    try {
      await scan(view.page);
      await view.page.getByTestId('member-name').waitFor();
      assert.equal(await view.page.getByRole('button', { name: 'Indløs belønning' }).count(), 0, JSON.stringify(changes));
    } finally { await view.close(); }
  }
});

test('an already redeemed reward is reported without a receipt', async () => {
  const { page, close } = await open({ api: { redeem: () => [409, { error: 'reward_not_available' }] } });
  try {
    await scan(page);
    await page.getByRole('button', { name: 'Indløs belønning' }).click();
    await page.getByRole('button', { name: 'Indløs', exact: true }).click();
    await page.getByRole('button', { name: 'Bekræft indløsning' }).click();
    await page.getByRole('alert').filter({ hasText: 'Belønningen er allerede indløst.' }).waitFor();
    assert.equal(await page.getByText('Belønning indløst').count(), 0);
  } finally { await close(); }
});

test('manual correction is shown only with the permission and requires a reason', async () => {
  const { page, calls, close } = await open();
  try {
    await scan(page);
    await page.getByRole('button', { name: 'Manuel korrektion' }).click();
    await page.getByRole('button', { name: 'Fjern stempler' }).click();
    await page.getByRole('button', { name: 'Flere' }).click();
    assert.equal(await page.getByRole('button', { name: 'Gem korrektion' }).isDisabled(), true);
    await page.getByLabel('Årsag (skal udfyldes)').fill('Forkert kunde scannet');
    await page.getByRole('button', { name: 'Gem korrektion' }).click();
    await page.getByText('Korrektion gemt').waitFor();
    const [, body] = calls.find(([name]) => name === 'correct');
    assert.deepEqual({ ...body, idempotencyKey: 'k' }, { brandId: 'b', locationId: 'l1', kind: 'remove_stamps', memberId: 'm1', count: 2, reason: 'Forkert kunde scannet', idempotencyKey: 'k' });
  } finally { await close(); }
  const view = await open({ api: { lookup: () => [200, lookup({ permissions: { redeem: true, correct: false } })] } });
  try {
    await scan(view.page);
    await view.page.getByTestId('member-name').waitFor();
    assert.equal(await view.page.getByRole('button', { name: 'Manuel korrektion' }).count(), 0);
  } finally { await view.close(); }
});

test('a brand with the program switched off allows no counter actions; the scope is remembered', async () => {
  const { page, close } = await open();
  try {
    await page.getByLabel('Afdeling').selectOption('l2');
    await page.getByLabel('Brand').selectOption('off');
    await page.getByRole('alert').filter({ hasText: 'Lukket Club er slået fra.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Scan QR-kode' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Søg kunde på e-mail' }).isDisabled(), true);
    await page.getByLabel('Brand').selectOption('b');
    await page.getByLabel('Afdeling').selectOption('l2');
    await page.reload();
    assert.equal(await page.getByLabel('Afdeling').inputValue(), 'l2');
  } finally { await close(); }
});

test('idle time locks the tablet, logs out and survives a reload; a lost session also locks', async () => {
  const { page, calls, close } = await open();
  try {
    await page.clock.runFor(30_000);
    assert.equal(calls.filter(([name]) => name === 'session:DELETE').length, 0);
    await page.clock.runFor(31_000);
    await page.getByText('Du blev logget ud efter 1 minutter uden aktivitet.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Scan QR-kode' }).count(), 0);
    assert.equal(calls.filter(([name]) => name === 'session:DELETE').length, 1);
  } finally { await close(); }
  // A logout that did not reach the server keeps the lock screen after a reload.
  const offline = await open({ api: { session: () => [503, { error: 'x' }] } });
  try {
    await offline.page.getByRole('button', { name: 'Skift bruger' }).click();
    await offline.page.getByRole('heading', { name: 'Kassevisning' }).waitFor();
    await offline.page.reload();
    await offline.page.getByRole('heading', { name: 'Kassevisning' }).waitFor();
    assert.equal(await offline.page.getByRole('button', { name: 'Scan QR-kode' }).count(), 0);
  } finally { await offline.close(); }
  const expired = await open({ api: { stamp: () => [401, { error: 'unauthorized' }] } });
  try {
    await scan(expired.page);
    await expired.page.getByRole('button', { name: 'Giv stempel' }).click();
    await expired.page.getByRole('button', { name: 'Dine-in' }).click();
    await expired.page.getByLabel('Købsbeløb inkl. moms (kr.)').fill('150');
    await expired.page.getByRole('button', { name: 'Bekræft' }).click();
    await expired.page.getByText('Du er logget ud. Log ind igen.').waitFor();
  } finally { await expired.close(); }
});

test('switching user logs in with name and PIN and remembers the name, never the PIN', async () => {
  const { page, calls, close } = await open({ api: { session: request => request.method() === 'POST' && JSON.parse(request.postData()).pin === '000000' ? [403, { error: 'x' }] : [200, { ok: true }] } });
  try {
    await page.getByRole('button', { name: 'Skift bruger' }).click();
    await page.getByLabel('Navn eller e-mail').fill('Bo Hansen');
    await page.getByRole('button', { name: 'Fortsæt' }).click();
    await page.getByLabel('6-cifret PIN').fill('000000');
    await page.getByRole('button', { name: 'Log ind' }).click();
    await page.getByRole('alert').filter({ hasText: 'Kunne ikke logge ind. Kontrollér navn og PIN.' }).waitFor();
    await page.getByLabel('6-cifret PIN').fill('123456');
    await Promise.all([page.waitForURL(`${origin}/merchant/stamp-card`, { waitUntil: 'load' }), page.getByRole('button', { name: 'Log ind' }).click()]);
    assert.deepEqual(calls.filter(([name]) => name === 'session:POST').map(([, body]) => body),
      [{ provider: 'opsfly', identifier: 'Bo Hansen', pin: '000000' }, { provider: 'opsfly', identifier: 'Bo Hansen', pin: '123456' }]);
    // The fresh login is not locked by the earlier session's lock or idle state.
    await page.getByRole('button', { name: 'Scan QR-kode' }).waitFor();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    assert.match(stored, /Bo Hansen/); assert.doesNotMatch(stored, /123456/);
    await page.getByRole('button', { name: 'Skift bruger' }).click();
    await page.getByRole('button', { name: 'Bo Hansen', exact: true }).click();
    await page.getByText('Logger ind som').waitFor();
  } finally { await close(); }
});

test('employees without an active counter location see a clear message', async () => {
  const { page, close } = await open({ props: { brands: [] } });
  try { await page.getByRole('alert').filter({ hasText: 'Du har ikke adgang til stempelkortet i en aktiv afdeling.' }).waitFor(); }
  finally { await close(); }
});
