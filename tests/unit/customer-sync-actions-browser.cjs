const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const webpack = require('next/dist/compiled/webpack/webpack');
const { chromium, expect } = require('@playwright/test');

const root = process.cwd();
let dir, server, browser, origin;

before(async () => {
  webpack.init();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-sync-actions-'));
  const file = (name, source) => {
    const target = path.join(dir, name + '.js');
    fs.writeFileSync(target, source);
    return target;
  };
  const entry = file('entry', `import React from 'react';import{createRoot}from'react-dom/client';import{CustomerSyncActions}from${JSON.stringify(path.join(root, 'src/app/superadmin/customers/customer-sync-actions.tsx'))};function App(){const[msg,setMsg]=React.useState('');React.useEffect(()=>{const onToast=e=>setMsg(e.detail.description);window.addEventListener('toast',onToast);return()=>window.removeEventListener('toast',onToast)},[]);return <><CustomerSyncActions brands={[{id:'brand-a',name:'Brand A'},{id:'brand-b',name:'Brand B'}]}/><p role="status">{msg}</p></>}createRoot(document.getElementById('root')).render(<App/>);`);
  const loader = file('loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const toast = file('toast', `export const useToast=()=>({toast:value=>window.dispatchEvent(new CustomEvent('toast',{detail:value}))});`);
  const navigation = file('navigation', `export const useRouter=()=>({refresh:()=>{window.__refreshes=(window.__refreshes||0)+1;}});`);
  const aliases = {
    '@/hooks/use-toast': toast,
    'next/navigation': navigation,
    'react$': require.resolve('next/dist/compiled/react'),
    'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
    'react-dom$': require.resolve('next/dist/compiled/react-dom'),
    'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client'),
    '@': path.join(root, 'src'),
  };
  await new Promise((resolve, reject) => webpack.webpack({
    mode: 'development',
    devtool: false,
    entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: aliases, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /customer-sync-actions-.*\.js$/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));

  server = http.createServer((request, response) => {
    if (request.url === '/bundle.js') {
      response.setHeader('content-type', 'application/javascript');
      return response.end(fs.readFileSync(path.join(dir, 'bundle.js')));
    }
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('manual sync requires one chosen brand and starts the matching source without campaign sends', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const calls = [];
  await page.route('**/api/superadmin/customers/sync', async route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ json: body.source === 'omnisend' ? {
      success: true,
      source: 'omnisend',
      fetched: 25,
      imported: 24,
      skipped: 1,
      conflicts: 0,
      hasMore: false,
      backfillComplete: true,
    } : {
      success: true,
      source: 'bookings',
      message: '12 bookinger lagt i kø.',
    } });
  });
  await page.goto(origin);
  const omnisend = page.getByRole('button', { name: 'Synk Omnisend', exact: true });
  const bookings = page.getByRole('button', { name: 'Synk bordbookinger', exact: true });
  await expect(omnisend).toBeDisabled();
  await expect(bookings).toBeDisabled();
  await page.getByRole('combobox', { name: 'Brand til synkronisering' }).click();
  await page.getByRole('option', { name: 'Brand A', exact: true }).click();
  await expect(omnisend).toBeEnabled();
  await expect(bookings).toBeEnabled();

  await omnisend.click();
  await expect(page.getByRole('status').filter({ hasText: '25 kontakter læst, 24 importeret eller opdateret, 1 udeladt' })).toBeVisible();
  await bookings.click();
  await expect(page.getByRole('status').filter({ hasText: '12 bookinger lagt i kø' })).toBeVisible();
  assert.deepEqual(calls, [
    { brandId: 'brand-a', source: 'omnisend' },
    { brandId: 'brand-a', source: 'bookings' },
  ]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(await page.evaluate(() => window.__refreshes), 2);
});

test('one manual Omnisend click continues through every page and aggregates the result', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const calls = [];
  let omnisendRequests = 0;
  let finishSecondPage;
  const secondPage = new Promise(resolve => { finishSecondPage = resolve; });
  await page.route('**/api/superadmin/customers/sync', async route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.source !== 'omnisend') {
      await route.fulfill({ json: { success: true, source: 'bookings', message: '12 bookinger lagt i kø.' } });
      return;
    }
    omnisendRequests++;
    if (omnisendRequests === 1) {
      await route.fulfill({ json: {
        success: true, source: 'omnisend', fetched: 25, imported: 24, skipped: 1, conflicts: 0,
        hasMore: true, backfillComplete: false,
      } });
      return;
    }
    await secondPage;
    await route.fulfill({ json: {
      success: true, source: 'omnisend', fetched: 10, imported: 9, skipped: 0, conflicts: 1,
      hasMore: false, backfillComplete: true,
    } });
  });

  await page.goto(origin);
  await page.getByRole('combobox', { name: 'Brand til synkronisering' }).click();
  await page.getByRole('option', { name: 'Brand A', exact: true }).click();
  const omnisend = page.getByRole('button', { name: 'Synk Omnisend', exact: true });
  await omnisend.click();

  const progress = page.getByRole('status').filter({ hasText: '1 sider hentet, 25 kontakter læst' });
  await expect(progress).toBeVisible();
  await expect(omnisend).toBeDisabled();
  await expect.poll(() => omnisendRequests).toBe(2);
  finishSecondPage();

  await expect(page.getByRole('status').filter({
    hasText: 'Import færdig: 35 kontakter læst, 33 importeret eller opdateret, 1 udeladt, 1 identitetskonflikter.',
  })).toBeVisible();
  assert.deepEqual(calls, [
    { brandId: 'brand-a', source: 'omnisend' },
    { brandId: 'brand-a', source: 'omnisend' },
  ]);
  assert.deepEqual(await page.evaluate(() => window.__refreshes), 1);
});

test('shows the source and brand while a sync request is pending', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
  t.after(() => context.close());
  const page = await context.newPage();
  let finishRequest;
  const responseGate = new Promise(resolve => { finishRequest = resolve; });
  await page.route('**/api/superadmin/customers/sync', async route => {
    await responseGate;
    await route.fulfill({ json: {
      success: true,
      source: 'omnisend',
      fetched: 25,
      imported: 25,
      skipped: 0,
      conflicts: 0,
      hasMore: false,
      backfillComplete: true,
      message: '25 kontakter blev importeret.',
    } });
  });

  await page.goto(origin);
  await page.getByRole('combobox', { name: 'Brand til synkronisering' }).click();
  await page.getByRole('option', { name: 'Brand A', exact: true }).click();
  const omnisend = page.getByRole('button', { name: 'Synk Omnisend', exact: true });
  await omnisend.click();

  const status = page.getByRole('status').filter({ hasText: 'Synkroniserer Omnisend-kontakter for Brand A' });
  await expect(status).toBeVisible();
  await expect(status.locator('svg.animate-spin')).toHaveCount(1);
  await expect(omnisend).toHaveAttribute('aria-busy', 'true');

  finishRequest();
  await expect(page.getByRole('status').filter({ hasText: 'Import færdig: 25 kontakter læst' })).toBeVisible();
});
