// Production dashboard and loading UI; only data and navigation transport are synthetic.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();

const root = process.cwd();
let dir, server, browser, origin;
const initialQuery = '?dateFrom=2026-09-01&dateTo=2026-09-21';

function file(name, code) {
  const target = path.join(dir, name + '.js');
  fs.writeFileSync(target, code);
  return target;
}

function result(sessions = 12) {
  return {
    totals: { sessions, view_menu: 10, view_product: 8, add_to_cart: 5,
      start_checkout: 4, click_purchase: 3, payment_succeeded: 2,
      paidOrders: 2, measuredPurchasingSessions: 2, measuredPaidOrders: 2, revenue_paid: 15000 },
    attribution: [], byLocation: [], dataQualityWarnings: [],
  };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-loading-browser-'));
  execFileSync(path.join(root,'node_modules/.bin/tailwindcss'), ['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'], {cwd:root,stdio:'pipe'});
  const navigation = file('navigation', `import React from 'react';
    export const RouterContext = React.createContext(null);
    export const useRouter = () => React.useContext(RouterContext);
    export const usePathname = () => '/superadmin/analytics/cust-funnel';`);
  const entry = file('entry', `import React, {Suspense, useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {RouterContext} from './navigation';
    import {AnalyticsDashboardClient} from ${JSON.stringify(path.join(root, 'src/components/superadmin/analytics-dashboard-client.tsx'))};
    import Loading from ${JSON.stringify(path.join(root, 'src/app/superadmin/analytics/cust-funnel/loading.tsx'))};
    import SuperadminError from ${JSON.stringify(path.join(root, 'src/app/superadmin/error.tsx'))};
    function request(href) {
      let state = 'pending', value;
      const query = new URL(href, location.origin).search;
      const promise = fetch('/data'+query).then(async response => {
        if (!response.ok) throw Error('Synthetic analytics read failed');
        value = {data: await response.json(), filters: Object.fromEntries(new URLSearchParams(query))};
        state = 'ready';
      }).catch(error => { state = 'failed'; value = error; });
      return {read() { if (state === 'pending') throw promise; if (state === 'failed') throw value; return value; }};
    }
    class Boundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) { return {error}; }
      render() { return this.state.error ? <SuperadminError error={this.state.error} reset={() => location.reload()}/> : this.props.children; }
    }
    function Dashboard({resource}) {
      const {data, filters} = resource.read();
      return <AnalyticsDashboardClient initialData={data} searchParams={filters}
        brands={[{id:'b', name:'QA Brand'}]} locations={[{id:'l', brandId:'b', name:'QA Location'}]}/>;
    }
    const initial = request(location.href);
    function App() {
      const [resource, setResource] = useState(initial);
      const router = {push(href) { history.pushState(null, '', href); setResource(request(href)); }, refresh() { setResource(request(location.href)); }};
      return <RouterContext.Provider value={router}><Boundary><Suspense fallback={<Loading/>}><Dashboard resource={resource}/></Suspense></Boundary></RouterContext.Provider>;
    }
    createRoot(document.getElementById('root')).render(<App/>);`);
  const loader = file('ts-loader', `const ts = require(${JSON.stringify(require.resolve('typescript'))});
    module.exports = source => ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry,
    output: {path: dir, filename: 'bundle.js'},
    resolve: {
      extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'],
      alias: {
        'next/navigation': navigation,
        '@/app/superadmin/analytics/cust-funnel/actions': file('actions', `export const runAggregationForDates = () => { throw Error('Unexpected write'); };`),
        '@': path.join(root, 'src'),
      },
    },
    module: {rules: [{test: /\.[jt]sx?$/, exclude: /node_modules/, use: [loader]}]},
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({all:false, errors:true}))) : resolve()));
  server = http.createServer((req, res) => {
    if (req.url === '/styles.css') { res.setHeader('content-type','text/css'); return res.end(fs.readFileSync(path.join(dir,'styles.css'))); }
    if (req.url === '/bundle.js') {
      res.setHeader('content-type', 'application/javascript');
      return res.end(fs.readFileSync(path.join(dir, 'bundle.js')));
    }
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true, executablePath:process.env.CART_CHROMIUM_PATH, args:['--no-sandbox', '--disable-dev-shm-usage']});
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dir) fs.rmSync(dir, {recursive:true, force:true});
});

async function setup(t, query = initialQuery) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const requests = [];
  await page.route('**/data?*', route => { requests.push(route); });
  const nextRequest = async () => {
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    return requests.shift();
  };
  const complete = (route, data = result()) => route.fulfill({json:data});
  await page.goto(origin + '/superadmin/analytics/cust-funnel' + query);
  return {page, nextRequest, complete};
}

test('initial data shows the accessible spinner until results arrive', async t => {
  const {page, nextRequest, complete} = await setup(t);
  const request = await nextRequest();
  await expect(page.getByRole('status')).toHaveText('Indlæser…');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await complete(request);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('Sessions', {exact:true}).first()).toBeVisible();
});

test('filter changes retain results and their counting label until empty data arrives', async t => {
  const {page, nextRequest, complete} = await setup(t);
  await complete(await nextRequest());
  await page.getByRole('combobox', {name:'Counting', exact:true}).click();
  await page.getByRole('option', {name:'Unique Sessions', exact:true}).click();
  const request = await nextRequest();
  assert.equal(new URL(request.request().url()).searchParams.get('counting'), 'unique');
  await expect(page.getByRole('status')).toHaveText('Indlæser…');
  await expect(page.getByText('12', {exact:true})).toBeVisible();
  await expect(page.getByText('Antal hændelser pr. handling.', {exact:false})).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  const empty = result(0);
  for (const key of Object.keys(empty.totals)) empty.totals[key] = 0;
  await complete(request, empty);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText('Unikke sessions pr. handling.', {exact:false})).toBeVisible();
  await expect(page.getByText('Ingen betalte ordrer i perioden.')).toBeVisible();
});

test('a superseded filter response cannot clear loading for the latest request', async t => {
  const {page, nextRequest, complete} = await setup(t);
  await complete(await nextRequest());
  await page.getByRole('option', {name:'QA Brand', exact:true}).click();
  const first = await nextRequest();
  await page.getByRole('option', {name:'QA Location', exact:true}).click();
  const latest = await nextRequest();
  assert.equal(new URL(latest.request().url()).searchParams.get('brandId'), 'b');
  assert.equal(new URL(latest.request().url()).searchParams.get('locationId'), 'l');
  await complete(first, result(99));
  await expect(page.getByRole('status')).toHaveText('Indlæser…');
  await expect(page.getByText('12', {exact:true})).toBeVisible();
  await complete(latest, result(7));
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('7', {exact:true})).toBeVisible();
  await expect(page.getByText('99', {exact:true})).toHaveCount(0);
});

test('a failed filter read replaces the spinner with the existing error UI', async t => {
  const {page, nextRequest, complete} = await setup(t);
  await complete(await nextRequest());
  await page.getByRole('combobox', {name:'Enhed', exact:true}).click();
  await page.getByRole('option', {name:'Mobil', exact:true}).click();
  const request = await nextRequest();
  await expect(page.getByRole('status')).toHaveText('Indlæser…');
  await request.fulfill({status:500, body:'Synthetic failure'});
  await expect(page.getByRole('heading', {name:'Noget gik galt i Superadmin'})).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Prøv igen'})).toBeVisible();
});


test('option dashboard separates new additions from edits and shows unmeasurable empty cohorts', async t => {
  const {page,nextRequest,complete}=await setup(t);
  const data=result();
  data.optionExperience={opened:10,changed:7,added:4,withoutAdd:6,editedOpened:3,savedEdits:2,offers:5,accepted:1,rejected:2};
  await complete(await nextRequest(),data);
  const card=page.locator('div.rounded-lg').filter({has:page.getByText('Tilvalg og mersalg',{exact:true})}).first();
  await expect(card.getByText('Nye produkter lagt i kurven',{exact:true})).toBeVisible();
  await expect(card.getByText('4 / 10',{exact:true})).toBeVisible();
  await expect(card.getByText('40.0 %',{exact:true})).toBeVisible();
  await expect(card.getByText('2 gemt / 3 åbnet',{exact:true})).toBeVisible();
  await expect(card.getByText('1 / 5',{exact:true})).toBeVisible();
  await expect(card).toContainText('ikke betalte køb');
  await expect(card).not.toContainText(/NaN|Infinity/);
  await page.getByRole('combobox',{name:'Counting',exact:true}).click();
  await page.getByRole('option',{name:'Unique Sessions',exact:true}).click();
  data.optionExperience={opened:0,changed:0,added:0,withoutAdd:0,editedOpened:0,savedEdits:0,offers:0,accepted:0,rejected:0};
  await complete(await nextRequest(),data);
  await expect(card.getByText('Endnu ikke målbart',{exact:true})).toBeVisible();
  await expect(card).not.toContainText(/NaN|Infinity|40.0/);
});

test('mobile option cards fit viewport and device changes preserve tenant and date filters',async t=>{
 const {page,nextRequest,complete}=await setup(t,initialQuery+'&brandId=b&locationId=l&utmSource=newsletter&counting=unique');
 await page.setViewportSize({width:390,height:844});
 const data=result();data.optionExperience={opened:10,changed:7,added:4,withoutAdd:6,editedOpened:3,savedEdits:2,offers:5,accepted:1,rejected:2};
 await complete(await nextRequest(),data);
 const card=page.locator('div.rounded-lg').filter({has:page.getByText('Tilvalg og mersalg',{exact:true})}).first();
 await card.scrollIntoViewIfNeeded();
 const geometry=await card.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:el.scrollWidth>el.clientWidth};});
 assert.ok(geometry.left>=0&&geometry.right<=geometry.width,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
 await page.getByRole('combobox',{name:'Enhed',exact:true}).click();await page.getByRole('option',{name:'Mobil',exact:true}).click();
 const request=await nextRequest();const params=new URL(request.request().url()).searchParams;
 for(const [key,value]of Object.entries({brandId:'b',locationId:'l',dateFrom:'2026-09-01',dateTo:'2026-09-21',utmSource:'newsletter',counting:'unique',device:'mobile'}))assert.equal(params.get(key),value);
 await complete(request,data);await expect(card.getByText('4 / 10',{exact:true})).toBeVisible();
});
