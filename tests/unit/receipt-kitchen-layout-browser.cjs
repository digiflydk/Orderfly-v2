const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('kitchen layout: real Tailwind styles preserve 58/80mm mobile content and long notes', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitchen-layout-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{KitchenReceiptPreview}from ${JSON.stringify(path.join(root, 'src/components/receipts/kitchen-receipt-preview.tsx'))};import{SAMPLE_KITCHEN_RECEIPT}from ${JSON.stringify(path.join(root, 'src/lib/receipts/kitchen-preview.ts'))};import{DEFAULT_KITCHEN_SETTINGS}from ${JSON.stringify(path.join(root, 'src/lib/receipts/kitchen-settings.ts'))};const root=createRoot(document.getElementById('root'));window.renderTicket=(width,stress=false)=>root.render(React.createElement(KitchenReceiptPreview,{settings:{...DEFAULT_KITCHEN_SETTINGS,paperWidthMm:width},order:stress?{...SAMPLE_KITCHEN_RECEIPT,reference:'LANGTORDRENUMMER012345678901234567890123456789',notes:'Bemærkning '+('megetlangtordudenmellemrum'.repeat(8)),lines:[{...SAMPLE_KITCHEN_RECEIPT.lines[1],name:'Lang ret '+('Ekstralangtproduktnavn'.repeat(8)),modifiers:['Uden løg','Ekstra ost',('Tilvalgudenmellemrum'.repeat(8))]}]}:SAMPLE_KITCHEN_RECEIPT}));window.renderTicket(80);`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  // Compile the project's actual config and global CSS, rather than recreating its layout in a test.
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/style.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main style="padding:16px"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const ticket = page.getByRole('article', { name: 'Forhåndsvisning af køkkenbon' });
  for (const width of [80, 58]) {
    await page.evaluate(width => window.renderTicket(width), width);
    await expect(ticket).toHaveAttribute('data-paper-width', String(width));
    await expect(ticket).toContainText('EKSEMPEL-1042');
    await expect(ticket).toContainText('Menuindhold i alt');
    await expect(ticket).toContainText('2 × Kyllingburger');
    await expect(ticket).toContainText('Uden løg');
    const measurements = await ticket.evaluate(element => ({
      width: element.getBoundingClientRect().width, overflow: element.scrollWidth > element.clientWidth,
      fontSize: getComputedStyle(element).fontSize,
      categoryColor: getComputedStyle(element.querySelector('h3')).backgroundColor,
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    assert.ok(Math.abs(measurements.width - width * 96 / 25.4) < 1, JSON.stringify(measurements));
    assert.equal(measurements.overflow, false); assert.equal(measurements.bodyOverflow, false);
    assert.equal(measurements.fontSize, '18px'); assert.equal(measurements.categoryColor, 'rgb(0, 0, 0)');
    if (process.env.KITCHEN_QA_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.KITCHEN_QA_SCREENSHOT_DIR, { recursive: true });
      await ticket.screenshot({ path: path.join(process.env.KITCHEN_QA_SCREENSHOT_DIR, `kitchen-${width}mm.png`) });
    }
    await page.evaluate(width => window.renderTicket(width, true), width);
    await expect(ticket).toContainText('LANGTORDRENUMMER012345678901234567890123456789');
    await expect(ticket).toContainText('megetlangtordudenmellemrum'.repeat(8));
    const overflow = await ticket.evaluate(element => Array.from(element.querySelectorAll('*')).filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.tagName));
    assert.deepEqual(overflow, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
});
