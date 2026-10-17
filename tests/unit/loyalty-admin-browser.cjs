// Actual stamp-card admin client components and compiled admin CSS; server actions and navigation are synthetic.
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
const NOW = Date.parse('2026-10-20T10:00:00Z');

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loyalty-admin-'));
  const write = (name, code) => { const file = path.join(dir, name); fs.writeFileSync(file, code); return file; };
  const src = rel => JSON.stringify(path.join(root, 'src', rel));
  const settings = { active: false, name: 'Esmeralda Club', stampsRequired: 8, minimumAmountOre: 10000, stampsPerPurchase: 1, cardValidityMonths: 6,
    reward: { type: 'free_product', productIds: ['pizza'], categoryIds: [] }, rewardDescription: 'Gratis pizza', rewardValidityMonths: 3, crossLocation: true,
    discountedOrdersQualify: false, sessionDays: 180, counterChannels: ['dine_in', 'takeaway'], orderTypes: ['pickup'], maxStampsPerDay: null, terms: 'Vilkår', consentText: 'Samtykke' };
  const members = [
    { id: 'm1', brandId: 'b', brandName: 'Esmeralda', name: '=HYPERLINK("x")', email: 'a@example.com', joinedAt: NOW - 86400000, stamps: 3, stampsRequired: 8, rewards: 1, nextExpiry: NOW + 9e8, newsletter: true, lastActivityAt: NOW },
    { id: 'm2', brandId: 'b', brandName: 'Esmeralda', name: 'Bo Hansen', email: 'bo@example.com', joinedAt: NOW, stamps: 0, stampsRequired: 8, rewards: 0, nextExpiry: null, newsletter: false, lastActivityAt: null },
  ];
  const events = [{ createdAt: NOW, type: 'stamp_added', memberId: 'm1', memberName: 'Anna', quantity: 1, amountOre: 15000, channel: 'takeaway', source: 'counter_search', locationName: 'Amager', actorId: 'a'.repeat(64), actorName: 'Kasse', reason: null, details: null },
    { createdAt: NOW - 1, type: 'settings_changed', memberId: null, memberName: '', quantity: 1, amountOre: null, channel: null, source: 'admin', locationName: null, actorId: 'b'.repeat(64), actorName: 'Leder', reason: null, details: 'stampsRequired: 8 → 10' }];
  const actions = write('actions.js', `
    const calls = window.__calls = [];
    export async function saveProgramSettings(input){ calls.push(['save', input]); return window.__saveResult || { ok: true, data: { version: 2, changed: 1 } }; }
    export async function exportMembers(brandIds){ calls.push(['members', brandIds]); return { ok: true, data: { rows: ${JSON.stringify(members)}, truncated: false } }; }
    export async function exportEvents(filter){ calls.push(['events', filter]); return { ok: true, data: { rows: ${JSON.stringify(events)}, actors: [], truncated: false } }; }
    export async function correctMemberAction(input){ calls.push(['correct', input]); return input.reason.includes('fejl') ? { ok: false, error: 'no_active_stamps' } : { ok: true, data: {} }; }`);
  const navigation = write('navigation.js', `
    export const useRouter = () => ({ refresh(){ (window.__refresh = (window.__refresh || 0) + 1); }, replace(url){ (window.__replaced = window.__replaced || []).push(url); }, push(){} });
    export const usePathname = () => '/superadmin/loyalty/stamp-card';
    export const useSearchParams = () => new URLSearchParams('tab=log&period=7d');`);
  const link = write('link.js', `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`);
  const entry = write('entry.js', `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { Toaster } from ${src('components/ui/toaster')};
    import { SettingsForm } from ${src('app/superadmin/loyalty/stamp-card/settings-form')};
    import { MembersTable } from ${src('app/superadmin/loyalty/stamp-card/members-table')};
    import { EventLog } from ${src('app/superadmin/loyalty/stamp-card/event-log')};
    import { CorrectionPanel } from ${src('app/superadmin/loyalty/stamp-card/members/[memberId]/correction-panel')};
    const view = location.pathname.slice(1);
    const node = view === 'settings' ? React.createElement(SettingsForm, { initial: { brand: { brandId: 'b', brandName: 'Esmeralda' }, version: 1, settings: ${JSON.stringify(settings)}, updatedAt: ${NOW}, updatedByName: 'Leder', products: [{ id: 'pizza', name: 'Pizza' }], categories: [] } })
      : view === 'members' ? React.createElement(MembersTable, { rows: ${JSON.stringify(members)}, truncated: false, brandIds: ['b'], filterQuery: 'period=30d', multiBrand: false })
      : view === 'log' ? React.createElement(EventLog, { rows: ${JSON.stringify(events)}, truncated: false, filter: { brandIds: ['b'], from: '2026-10-14', to: '2026-10-20', type: null, actorId: null, channel: null }, multiBrand: false })
      : React.createElement(CorrectionPanel, { brandId: 'b', memberId: 'm1', locations: [{ id: 'l1', name: 'Amager' }, { id: 'l2', name: 'Vesterbro' }], redeemedRewards: [{ id: 'r1', description: 'Gratis pizza', redeemedAt: ${NOW} }] });
    createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null, node, React.createElement(Toaster)));`);
  const loader = write('loader.js', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { 'next/navigation': navigation, '@/components/superadmin/admin-link': link, '@': path.join(root, 'src'),
      'react$': require.resolve('next/dist/compiled/react'), 'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
      'react-dom$': require.resolve('next/dist/compiled/react-dom'), 'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client') },
      extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    plugins: [new webpackModule.webpack.NormalModuleReplacementPlugin(/^(\.\/|\.\.\/\.\.\/)actions$/, actions)],
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /loyalty-admin-.*[\\/](entry|actions|navigation|link)\.js$/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="admin-shell min-h-screen bg-background p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function open(view, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
  await page.goto(`${origin}/${view}`);
  return page;
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const calls = page => page.evaluate(() => window.__calls);

for (const width of [390, 1440]) test(`settings save converts kroner, keeps the version and reports field errors at ${width}px`, async () => {
  const page = await open('settings', width);
  try {
    await page.getByRole('switch', { name: 'Program aktivt' }).click();
    await page.getByLabel('Stempler til belønning').fill('10');
    await page.getByLabel('Minimumsbeløb pr. køb (kr.)').fill('99,50');
    await page.getByRole('checkbox', { name: 'Dine-in' }).click();
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByText('Indstillingerne er gemt').first().waitFor();
    const [[, input]] = await calls(page);
    assert.equal(input.brandId, 'b'); assert.equal(input.version, 1);
    assert.equal(input.settings.active, true); assert.equal(input.settings.stampsRequired, 10); assert.equal(input.settings.minimumAmountOre, 9950);
    assert.deepEqual(input.settings.counterChannels, ['takeaway']);
    await page.evaluate(() => { window.__saveResult = { ok: false, error: 'invalid_settings', fields: { consentText: 'Skal udfyldes, når programmet er aktivt.' } }; });
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByRole('alert').filter({ hasText: 'Skal udfyldes, når programmet er aktivt.' }).waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

for (const width of [390, 1440]) test(`members search, sort and export a CSV without formula injection at ${width}px`, async () => {
  const page = await open('members', width);
  try {
    await page.getByLabel('Søg på navn eller e-mail').fill('bo@');
    assert.equal(await page.getByRole('row').count(), 2);
    await page.getByLabel('Søg på navn eller e-mail').fill('');
    await page.getByRole('button', { name: 'Medlem' }).click();
    assert.equal(await page.getByRole('columnheader', { name: 'Medlem' }).getAttribute('aria-sort'), 'descending');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Eksportér CSV' }).click()]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    assert.match(csv, /^﻿"Brand";"Navn";"E-mail"/);
    assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
    assert.deepEqual((await calls(page))[0], ['members', ['b']]);
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('the log shows employees and setting changes, filters by type and exports', async () => {
  const page = await open('log', 1440);
  try {
    await page.getByRole('cell', { name: 'Kasse', exact: true }).waitFor();
    await page.getByRole('cell', { name: /stampsRequired: 8 → 10/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Slet|Redigér/ }).count(), 0);
    await page.getByLabel('Type').selectOption('reward_redeemed');
    assert.match((await page.evaluate(() => window.__replaced))[0], /type=reward_redeemed/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Eksportér CSV' }).click()]);
    assert.match(fs.readFileSync(await download.path(), 'utf8'), /"Kasse \(via søgning\)"/);
  } finally { await page.close(); }
});

test('manual correction requires a reason, uses a fresh idempotency key and reports rejections', async () => {
  const page = await open('correction', 390);
  try {
    const submit = page.getByRole('button', { name: 'Registrér korrektion' });
    assert.equal(await submit.isDisabled(), true);
    await page.getByLabel('Afdeling').selectOption('l2');
    await page.getByLabel('Antal stempler').fill('2');
    await page.getByLabel('Årsag (påkrævet)').fill('Papirkort ved kassenedbrud');
    await submit.click();
    await page.getByText('Korrektionen er registreret').first().waitFor();
    await page.getByLabel('Handling').selectOption('remove_stamps');
    await page.getByLabel('Årsag (påkrævet)').fill('Registreret ved fejl');
    await submit.click();
    await page.getByText('Medlemmet har ikke så mange aktive stempler.').first().waitFor();
    const [[, first], [, second]] = await calls(page);
    assert.deepEqual({ kind: first.kind, locationId: first.locationId, count: first.count, memberId: first.memberId }, { kind: 'add_stamps', locationId: 'l2', count: 2, memberId: 'm1' });
    assert.match(first.idempotencyKey, /^[a-f0-9]{64}$/); assert.notEqual(first.idempotencyKey, second.idempotencyKey);
    assert.equal(second.kind, 'remove_stamps');
    await page.getByLabel('Handling').selectOption('cancel_redemption');
    await page.getByRole('combobox', { name: /^Indløsning/ }).waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});
