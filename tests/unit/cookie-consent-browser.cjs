// Real cookie report, calendar and filters; synthetic read transport only.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const {chromium, expect} = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
const rows = [
  {id:'doc-one', anon_user_id:'11111111-1111-4111-8111-111111111111', brand_id:'b', brandName:'QA Brand', marketing:true, statistics:true, functional:false, linked_to_customer:true, consent_version:'v1', last_seen:'2026-09-20T22:30:00Z'},
  {id:'doc-two', anon_user_id:'22222222-2222-4222-8222-222222222222', brand_id:'c', brandName:'Other Brand', marketing:false, statistics:false, functional:false, consent_version:'v1', last_seen:'2026-09-21T08:00:00Z'},
];
function file(name, code) {
  const target = path.join(dir, name + '.js'); fs.writeFileSync(target, code); return target;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookie-consent-browser-'));
  const entry = file('entry', `import React from 'react';import {createRoot} from 'react-dom/client';
    import {CookiesClientPage} from ${JSON.stringify(path.join(root, 'src/app/superadmin/analytics/cookies/client-page.tsx'))};
    createRoot(document.getElementById('root')).render(<CookiesClientPage
      initialConsents={${JSON.stringify(rows)}} brands={[{id:'b',name:'QA Brand'},{id:'c',name:'Other Brand'}]}
      initialDateFrom="2026-09-21" initialDateTo="2026-09-21"/>);`);
  const actions = file('actions', `export async function getAnonymousCookieConsents(from,to) {
    const response = await fetch('/read', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({from,to})});
    if (!response.ok) throw Error('Synthetic read failed'); return response.json();
  }`);
  const loader = file('ts-loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode:'development', devtool:false, entry, output:{path:dir, filename:'bundle.js'},
    plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
      if (resource.context === path.join(root, 'src/app/superadmin/analytics/cookies')) resource.request = actions;
    })],
    resolve:{alias:{'@':path.join(root, 'src')}, extensions:['.tsx','.ts','.js'], modules:[path.join(root, 'node_modules'),'node_modules']},
    module:{rules:[{test:/\.[jt]sx?$/, exclude:/node_modules/, use:[loader]}]},
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({all:false,errors:true}))) : resolve()));
  const css = await require('postcss')([require('tailwindcss')({config:path.join(root, 'tailwind.config.ts')})])
    .process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), {from:path.join(root, 'src/app/globals.css')});
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
    if (req.url === '/style.css') {res.setHeader('content-type','text/css');return res.end(css.css);}
    res.setHeader('content-type','text/html');
    res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true, executablePath:process.env.CART_CHROMIUM_PATH, args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dir) fs.rmSync(dir, {recursive:true,force:true});
});

async function setup(t) {
  // Deliberately outside Denmark: calendar dates must survive browser timezone conversion.
  const context = await browser.newContext({timezoneId:'America/Los_Angeles',viewport:{width:1280,height:900}});
  t.after(() => context.close());
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  await page.clock.setFixedTime(new Date('2026-09-21T12:00:00Z'));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  const requests = [];
  await page.route('**/read', route => {requests.push(route);});
  const nextRequest = async () => {await expect.poll(() => requests.length).toBeGreaterThan(0);return requests.shift();};
  await page.goto(origin);
  await expect(page.getByRole('cell', {name:'QA Brand',exact:true})).toBeVisible();
  return {page, nextRequest, requests};
}
const complete = (route, data = rows) => route.fulfill({json:data});
async function selectDay(page, day, open = true) {
  if (open) await page.locator('#date').click();
  await page.getByRole('grid', {name:'September 2026',exact:true}).locator('button[name="day"]').filter({hasText:new RegExp('^' + day + '$')}).click();
}
async function choose(page, name, option) {
  await page.getByRole('combobox', {name,exact:true}).click();
  await page.getByRole('option', {name:option,exact:true}).click();
}

test('initial selection and timestamps describe the same Danish day', async t => {
  const {page} = await setup(t);
  await expect(page.locator('#date')).toHaveText('Sep 21, 2026 - Sep 21, 2026');
  await expect(page.getByRole('cell', {name:'21.09.2026 00:30',exact:true})).toBeVisible();
  await expect(page.getByText('Viser samtykker sidst opdateret 21.09.2026 – 21.09.2026 (Europe/Copenhagen).')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('marketing, linked state, brand and anonymous-ID search filter the displayed rows', async t => {
  const {page} = await setup(t);
  await choose(page, 'Marketingsamtykke', 'Ikke accepteret');
  await choose(page, 'Kundetilknytning', 'Not Linked');
  await expect(page.getByRole('cell', {name:'Other Brand',exact:true})).toBeVisible();
  await expect(page.getByRole('cell', {name:'QA Brand',exact:true})).toHaveCount(0);
  await choose(page, 'Brand', 'Other Brand');
  await page.getByRole('textbox', {name:'Søg efter anonymt bruger-ID'}).fill('  22222222-2222  ');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody').getByRole('img', {name:'Nej',exact:true})).toHaveCount(4);
  await page.getByRole('textbox', {name:'Søg efter anonymt bruger-ID'}).fill('absent-id');
  await expect(page.getByText('No consents found.')).toBeVisible();
});

test('date-only Clear Filters resets the picker, fetches today and clears pending on empty results', async t => {
  const {page, nextRequest} = await setup(t);
  await selectDay(page, 20);
  const rangeRequest = await nextRequest();
  assert.deepEqual(rangeRequest.request().postDataJSON(), {from:'2026-09-20',to:'2026-09-21'});
  await expect(page.getByRole('status')).toHaveText('Indlæser samtykker…');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await complete(rangeRequest);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', {name:'Clear Filters'}).click();
  const resetRequest = await nextRequest();
  assert.deepEqual(resetRequest.request().postDataJSON(), {from:'2026-09-21',to:'2026-09-21'});
  await expect(page.locator('#date')).toHaveText('Sep 21, 2026 - Sep 21, 2026');
  await complete(resetRequest, []);
  await expect(page.getByText('No consents found.')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('clearing the calendar permits a historical single day without snapping back to today', async t => {
  const {page, nextRequest, requests} = await setup(t);
  await selectDay(page, 20);
  const old = await nextRequest();
  await selectDay(page, 20, false);
  await expect(page.locator('#date')).toHaveText('Pick a date');
  await expect(page.getByRole('status')).toHaveCount(0);
  assert.equal(requests.length, 0, 'clearing must not fetch today');
  await old.fulfill({status:500,body:'Superseded read failed'});
  await selectDay(page, 20, false);
  const single = await nextRequest();
  assert.deepEqual(single.request().postDataJSON(), {from:'2026-09-20',to:'2026-09-20'});
  await expect(page.getByRole('status')).toHaveText('Indlæser samtykker…');
  await complete(single, [{...rows[0],consent_version:'single-day'}]);
  await expect(page.getByRole('cell', {name:'single-day',exact:true})).toBeVisible();
  await expect(page.getByText('Viser samtykker sidst opdateret 20.09.2026 – 20.09.2026 (Europe/Copenhagen).')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name:'Clear Filters'}).click();
  const reset = await nextRequest();
  assert.deepEqual(reset.request().postDataJSON(), {from:'2026-09-21',to:'2026-09-21'});
  await complete(reset);
  await expect(page.locator('#date')).toHaveText('Sep 21, 2026 - Sep 21, 2026');
});

for (const order of ['older-success-first', 'latest-success-first', 'latest-then-old-error']) test(`latest date selection wins: ${order}`, async t => {
  const {page, nextRequest} = await setup(t);
  await selectDay(page, 20); const old = await nextRequest();
  await selectDay(page, 19, false); const latest = await nextRequest();
  const oldData = [{...rows[0],consent_version:'obsolete'}];
  const newData = [{...rows[0],consent_version:'latest'}];
  if (order !== 'older-success-first') {
    await complete(latest, newData);
    await expect(page.getByRole('cell', {name:'latest',exact:true})).toBeVisible();
    if (order === 'latest-then-old-error') await old.fulfill({status:500,body:'Older request failed'});
    else await complete(old, oldData);
  } else {
    await complete(old, oldData);
    await expect(page.getByRole('status')).toHaveText('Indlæser samtykker…');
    await expect(page.getByRole('cell', {name:'obsolete',exact:true})).toHaveCount(0);
    await complete(latest, newData);
  }
  await expect(page.getByRole('cell', {name:'latest',exact:true})).toBeVisible();
  await expect(page.getByRole('cell', {name:'obsolete',exact:true})).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed read retains the previous period and rows, then explicit retry succeeds', async t => {
  const {page, nextRequest} = await setup(t);
  await selectDay(page, 20); const request = await nextRequest();
  await page.keyboard.press('Escape');
  await request.fulfill({status:500,body:'Synthetic failure'});
  await expect(page.getByRole('alert')).toContainText('De senest indlæste data vises stadig.');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('cell', {name:'QA Brand',exact:true})).toBeVisible();
  await expect(page.getByText('Viser samtykker sidst opdateret 21.09.2026 – 21.09.2026 (Europe/Copenhagen).')).toBeVisible();
  await page.getByRole('button', {name:'Prøv igen',exact:true}).click();
  const retry = await nextRequest();
  assert.deepEqual(retry.request().postDataJSON(), request.request().postDataJSON());
  await expect(page.getByRole('status')).toHaveText('Indlæser samtykker…');
  await complete(retry);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('Viser samtykker sidst opdateret 20.09.2026 – 21.09.2026 (Europe/Copenhagen).')).toBeVisible();
});
