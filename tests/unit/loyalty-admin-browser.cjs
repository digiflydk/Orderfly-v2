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
const TEXTS = require('../helpers/load-ts.cjs').loadTs('src/lib/loyalty/stamp-card/texts.ts');

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loyalty-admin-'));
  const write = (name, code) => { const file = path.join(dir, name); fs.writeFileSync(file, code); return file; };
  const src = rel => JSON.stringify(path.join(root, 'src', rel));
  const settings = { active: false, name: 'Esmeralda Club', stampsRequired: 8, minimumAmountOre: 10000, stampsPerPurchase: 1, cardValidityMonths: 6,
    reward: { type: 'free_product', productIds: ['pizza'], categoryIds: [] }, rewardDescription: 'Gratis pizza', rewardValidityMonths: 3, crossLocation: true,
    discountedOrdersQualify: false, sessionDays: 180, counterChannels: ['dine_in', 'takeaway'], orderTypes: ['pickup'], maxStampsPerDay: null, minimumAge: 15, terms: 'Vilkår', consentText: 'Samtykke', consentHelp: '',
    termsAccept: 'Jeg accepterer vilkårene for {programnavn}.' };
  const members = [
    { id: 'm1', brandId: 'b', brandName: 'Esmeralda', name: '=HYPERLINK("x")', email: 'a@example.com', joinedAt: NOW - 86400000, stamps: 3, stampsRequired: 8, rewards: 1, nextExpiry: NOW + 9e8, newsletter: true, lastActivityAt: NOW },
    { id: 'm2', brandId: 'b', brandName: 'Esmeralda', name: 'Bo Hansen', email: 'bo@example.com', joinedAt: NOW, stamps: 0, stampsRequired: 8, rewards: 0, nextExpiry: null, newsletter: false, lastActivityAt: null },
  ];
  const events = [{ createdAt: NOW, type: 'stamp_added', memberId: 'm1', memberName: 'Anna', quantity: 1, amountOre: 15000, channel: 'takeaway', source: 'counter_search', locationName: 'Amager', actorId: 'a'.repeat(64), actorName: 'Kasse', reason: null, details: null },
    { createdAt: NOW - 1, type: 'settings_changed', memberId: null, memberName: '', quantity: 1, amountOre: null, channel: null, source: 'admin', locationName: null, actorId: 'b'.repeat(64), actorName: 'Leder', reason: null, details: 'stampsRequired: 8 → 10' }];
  // An active program on the standard texts, published as version 1.
  const standard = { ...settings, active: true, ...TEXTS.CURRENT_TEMPLATE.texts };
  const brandData = { name: 'Esmeralda', companyName: 'Esmeralda Pizza ApS', street: 'Vestergade 1', zipCode: '8000', city: 'Aarhus C', companyRegNo: '12345678',
    supportEmail: 'club@esmeralda.dk', privacyUrl: 'https://esmeralda.dk/privatliv' };
  const textsInitial = (brand, active) => JSON.stringify({ brand: { brandId: 'b', brandName: 'Esmeralda' }, version: 3, settings: { ...standard, active }, updatedAt: NOW, updatedByName: 'Leder',
    products: [{ id: 'pizza', name: 'Pizza' }], categories: [], texts: { version: 1, effectiveFrom: NOW, key: TEXTS.textKey(standard), templateVersion: TEXTS.CURRENT_TEMPLATE.version },
    textContext: { brand, activeLocations: 2 } });
  const actions = write('actions.js', `
    const calls = window.__calls = [];
    export async function saveProgramSettings(input){ calls.push(['save', input]); return window.__saveResult || { ok: true, data: { version: 2, changed: 1 } }; }
    export async function setProgramActiveAction(input){ calls.push(['active', input]); return window.__activeResult || { ok: true, data: { version: input.version + 1, changed: 1 } }; }
    export async function exportMembers(brandIds){ calls.push(['members', brandIds]); return { ok: true, data: { rows: ${JSON.stringify(members)}, truncated: false } }; }
    export async function exportEvents(filter){ calls.push(['events', filter]); return { ok: true, data: { rows: ${JSON.stringify(events)}, actors: [], truncated: false } }; }
    export async function correctMemberAction(input){ calls.push(['correct', input]); return input.reason.includes('fejl') ? { ok: false, error: 'no_active_stamps' } : { ok: true, data: {} }; }`);
  const navigation = write('navigation.js', `
    export const useRouter = () => ({ refresh(){ (window.__refresh = (window.__refresh || 0) + 1); }, replace(url){ (window.__replaced = window.__replaced || []).push(url); }, push(url){ (window.__pushed = window.__pushed || []).push(url); } });
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
    import { ProgramsOverview } from ${src('app/superadmin/loyalty/stamp-card/programs-overview')};
    import { OverviewCharts } from ${src('app/superadmin/loyalty/overview-charts')};
    const view = location.pathname.slice(1);
    const node = view === 'settings' ? React.createElement(SettingsForm, { initial: { brand: { brandId: 'b', brandName: 'Esmeralda' }, version: 1, settings: ${JSON.stringify(settings)}, updatedAt: ${NOW}, updatedByName: 'Leder', products: [{ id: 'pizza', name: 'Pizza' }], categories: [],
      texts: { version: 0, effectiveFrom: null, key: null, templateVersion: null }, textContext: { brand: { name: 'Esmeralda' }, activeLocations: 2 } }, canEditBrand: true })
      : view === 'texts' ? React.createElement(SettingsForm, { initial: ${textsInitial(brandData, true)}, canEditBrand: true })
      : view === 'texts-legacy' ? React.createElement(SettingsForm, { initial: { ...${textsInitial(brandData, true)}, settings: { ...${JSON.stringify(settings)}, active: true },
          texts: { version: 0, effectiveFrom: null, key: null, templateVersion: null } }, canEditBrand: true })
      : view === 'texts-missing' ? React.createElement(SettingsForm, { initial: ${textsInitial({ ...brandData, companyRegNo: null }, false)}, canEditBrand: false })
      : view === 'members' ? React.createElement(MembersTable, { rows: ${JSON.stringify(members)}, truncated: false, brandIds: ['b'], filterQuery: 'period=30d', multiBrand: false })
      : view === 'log' ? React.createElement(EventLog, { rows: ${JSON.stringify(events)}, truncated: false, filter: { brandIds: ['b'], from: '2026-10-14', to: '2026-10-20', type: null, actorId: null, channel: null }, multiBrand: false })
      : view === 'programs' ? React.createElement(ProgramsOverview, { status: 'all', editHref: '/superadmin/loyalty/stamp-card?tab=settings', available: [{ brandId: 'b3', brandName: 'Tredje' }],
          rows: [{ brandId: 'b', brandName: 'Esmeralda', companyName: 'Esmeralda ApS', name: 'Esmeralda Club', active: true, version: 4, updatedAt: ${NOW}, updatedByName: 'Leder', members: 12 },
            { brandId: 'b2', brandName: 'Andet', companyName: 'Andet ApS', name: 'Andet Club', active: false, version: 1, updatedAt: ${NOW}, updatedByName: null, members: 0 }] })
      : view === 'overview' ? React.createElement(OverviewCharts, { daily: [{ day: '2026-10-18', stamps: 4, redemptions: 1 }, { day: '2026-10-19', stamps: 0, redemptions: 0 }, { day: '2026-10-20', stamps: 7, redemptions: 2 }], channels: { dine_in: 5, takeaway: 6 } })
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

for (const width of [390, 1440]) test(`the texts preview shows the filled terms and a changed rule warns about notice at ${width}px`, async () => {
  const page = await open('texts', width);
  try {
    await page.getByRole('tab', { name: 'Forhåndsvisning' }).click();
    const preview = page.getByTestId('texts-preview');
    await preview.getByText(/Esmeralda Pizza ApS, Vestergade 1, 8000 Aarhus C, CVR-nr\. 12345678/).waitFor();
    assert.doesNotMatch(await preview.innerText(), /[{}]/);
    assert.match(await preview.innerText(), /Version 1, gældende fra 20\. oktober 2026\./);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByLabel('Minimumsbeløb pr. køb (kr.)').fill('150');
    await preview.getByText(/mindst 150 kr\. hos Esmeralda/).waitFor();
    assert.match(await preview.innerText(), /Version 2, gældende fra/);
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByRole('alertdialog', { name: 'Vilkårene ændres for et aktivt program' }).getByText(/30 dages varsel/).waitFor();
    await page.getByRole('button', { name: 'Annuller' }).click();
    assert.equal((await calls(page)).length, 0);
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByRole('button', { name: 'Gem ændringerne' }).click();
    await page.getByText('Indstillingerne er gemt').first().waitFor();
    const [[name, input]] = await calls(page);
    assert.equal(name, 'save'); assert.equal(input.settings.minimumAmountOre, 15000); assert.equal(input.settings.terms, TEXTS.CURRENT_TEMPLATE.texts.terms);
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('Gendan standardtekst restores all four texts only after confirmation; a rule unrelated to the texts saves without a warning', async () => {
  const page = await open('texts', 1440);
  try {
    await page.getByLabel('Samtykketekst').fill('Egen tekst');
    await page.getByLabel('Vilkår', { exact: true }).fill('Egne vilkår');
    await page.getByRole('button', { name: 'Gendan standardtekst' }).click();
    await page.getByRole('button', { name: 'Annuller' }).click();
    assert.equal(await page.getByLabel('Samtykketekst').inputValue(), 'Egen tekst');
    await page.getByRole('button', { name: 'Gendan standardtekst' }).click();
    await page.getByRole('button', { name: 'Gendan', exact: true }).click();
    for (const [label, field] of [['Samtykketekst', 'consentText'], ['Forklaring under samtykket', 'consentHelp'], ['Accept af vilkår', 'termsAccept']])
      assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), TEXTS.CURRENT_TEMPLATE.texts[field]);
    assert.equal(await page.getByLabel('Vilkår', { exact: true }).inputValue(), TEXTS.CURRENT_TEMPLATE.texts.terms);
    await page.getByLabel('Kundens login-session (dage)').fill('90');
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByText('Indstillingerne er gemt').first().waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal((await calls(page))[0][1].settings.sessionDays, 90);
  } finally { await page.close(); }
});

test('a program active since before text versions still warns when its terms change', async () => {
  const page = await open('texts-legacy', 1440);
  try {
    await page.getByLabel('Kundens login-session (dage)').fill('90');
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByText('Indstillingerne er gemt').first().waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    await page.getByLabel('Vilkår', { exact: true }).fill('Nye vilkår');
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByRole('alertdialog', { name: 'Vilkårene ændres for et aktivt program' }).waitFor();
    assert.equal((await calls(page)).length, 1);
  } finally { await page.close(); }
});

test('missing brand details are listed and a mistyped placeholder is flagged at once', async () => {
  const page = await open('texts-missing', 390);
  try {
    const alert = page.getByRole('alert').filter({ hasText: 'Programmet kan ikke aktiveres' });
    await alert.getByText('CVR-nr. mangler under Brands.').waitFor();
    await alert.getByText('Kontakt en platformsadministrator for at få brandets oplysninger udfyldt.').waitFor();
    assert.equal(await alert.getByRole('link').count(), 0);
    await page.getByRole('tab', { name: 'Forhåndsvisning' }).click();
    assert.equal(await page.getByTestId('texts-preview').locator('mark', { hasText: '{cvr}' }).count(), 1);
    await page.getByRole('tab', { name: 'Rediger' }).click();
    await page.getByLabel('Accept af vilkår').fill('Jeg accepterer {vilkaar}.');
    await page.getByRole('alert').filter({ hasText: 'Ukendt pladsholder: {vilkaar}' }).waitFor();
    await page.evaluate(() => { window.__saveResult = { ok: false, error: 'texts_incomplete', missing: [{ placeholder: 'cvr', label: 'CVR-nr.', fields: ['terms'] }] }; });
    await page.getByLabel('Accept af vilkår').fill('Jeg accepterer vilkårene.');
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByText('Mangler: CVR-nr.', { exact: true }).first().waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

test('an inactive draft with no product or category chosen saves without a reward', async () => {
  const page = await open('settings', 1440);
  try {
    await page.locator('div.rounded-full', { hasText: 'Pizza' }).getByRole('button').click();
    await page.getByRole('button', { name: 'Gem indstillinger' }).click();
    await page.getByText('Indstillingerne er gemt').first().waitFor();
    const [[, input]] = await calls(page);
    assert.equal(input.settings.active, false);
    assert.equal(input.settings.reward, null);
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

for (const width of [390, 1440]) test(`overview charts render one series each with a table alternative at ${width}px`, async () => {
  const page = await open('overview', width);
  try {
    for (const name of ['Stempler pr. dag', 'Indløsninger pr. dag', 'Stempler fordelt på kanal']) await page.getByRole('img', { name }).waitFor();
    await page.locator('.recharts-bar-rectangle').first().waitFor();
    assert.ok(await page.locator('.recharts-bar-rectangle').count() >= 6);
    await page.getByText('Vis tallene som tabel').click();
    await page.getByRole('cell', { name: '2026-10-20' }).waitFor();
    await page.getByText('Dine-in: 5 · Takeaway: 6').waitFor();
    assert.ok(await noOverflow(page));
  } finally { await page.close(); }
});

for (const width of [390, 1440]) test(`the stamp card overview lists programs, creates per brand and confirms activation changes at ${width}px`, async () => {
  const page = await open('programs', width);
  await page.getByText('2 af 2 stempelkort').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Rediger' }).first().getAttribute('href'), '/superadmin/loyalty/stamp-card?tab=settings&edit=b');
  await page.getByLabel('Status').selectOption('inactive');
  assert.deepEqual(await page.evaluate(() => window.__replaced), ['/superadmin/loyalty/stamp-card?tab=log&period=7d&status=inactive']);
  assert.equal(await page.getByRole('button', { name: 'Opret stempelkort' }).isDisabled(), true);
  await page.getByLabel('Opret for brand').selectOption('b3');
  await page.getByRole('button', { name: 'Opret stempelkort' }).click();
  assert.deepEqual(await page.evaluate(() => window.__pushed), ['/superadmin/loyalty/stamp-card?tab=settings&edit=b3']);
  // Nothing changes until the dialog is confirmed.
  await page.getByRole('button', { name: 'Deaktivér', exact: true }).click();
  await page.getByRole('alertdialog').getByText('Deaktivér Esmeralda Club?').waitFor();
  await page.getByRole('button', { name: 'Annullér' }).click();
  assert.deepEqual(await calls(page), []);
  // A slow request keeps the dialog locked until it settles.
  await page.evaluate(() => { window.__activeResult = new Promise(resolve => { window.__resolveActive = resolve; }); });
  await page.getByRole('button', { name: 'Deaktivér', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Deaktivér', exact: true }).click();
  assert.equal(await page.getByRole('alertdialog').getByRole('button', { name: 'Deaktivér', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.__resolveActive({ ok: true, data: { version: 5, changed: 1 } }));
  await page.getByRole('alertdialog').waitFor({ state: 'detached' });
  await page.evaluate(() => { window.__calls.length = 0; window.__activeResult = { ok: false, error: 'settings_incomplete' }; });
  await page.getByRole('button', { name: 'Aktivér', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Aktivér', exact: true }).click();
  await page.getByText('Udfyld indstillingerne (belønning, vilkår og samtykketekst), før programmet aktiveres.').first().waitFor();
  assert.deepEqual(await calls(page), [['active', { brandId: 'b2', version: 1, active: true }]]);
  assert.ok(await noOverflow(page));
  await page.close();
});
