// Independent acceptance harness: actual terminal React/CSS, synthetic HTTP only.
// No authentication, production data writes, customer messages or physical printing.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
const now = '2026-10-25T12:00:00.000Z';
const locations = [
  { brandId: 'brand-a', brandName: 'Nord Pizza', locationId: 'loc-a', locationName: 'Amager' },
  { brandId: 'brand-b', brandName: 'Syd Pizza', locationId: 'loc-b', locationName: 'Valby' },
];
function order(id, extra = {}) {
  return { id, brandId: 'brand-a', locationId: 'loc-a', brandName: 'Nord Pizza', locationName: 'Amager',
    customerName: 'Syntetisk kunde', customerContact: 'fixture@example.test', customerPhone: '00000000',
    deliveryAddress: '', notes: 'Ingen løg', createdAt: '2026-10-25T11:45:00.000Z',
    fulfillmentAt: '2026-10-25T12:15:00.000Z', deliveryTime: '13:15', deliveryType: 'Pickup',
    status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', totalAmount: 129,
    refundedAmountOre: 0, items: [{ name: 'Pizza Italiana', quantity: 2, unitPrice: 64.5, totalPrice: 129, modifiers: ['Ekstra svampe', 'Uden løg'] }], ...extra };
}
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-terminal-browser-'));
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js'), navigation = path.join(dir, 'navigation.js'), actions = path.join(dir, 'actions.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{TerminalClient}from ${JSON.stringify(path.join(root, 'src/app/merchant/orders/terminal-client.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(TerminalClient, window.__kdsProps || {}));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  fs.writeFileSync(navigation, `export const useRouter=()=>({refresh(){window.dispatchEvent(new Event('focus'));},push(url){window.__navigation=url;}});export const usePathname=()=>'/merchant/orders';export const useSearchParams=()=>new URLSearchParams();`);
  fs.writeFileSync(actions, `export async function registerPickupPayment(id,method){return window.__registerPayment(id,method);}export async function cancelPickupOrder(){throw Error('Cancellation outside fixture scope');}export async function updateOrderStatus(){throw Error('Legacy status action must not be used by terminal');}`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { 'next/navigation': navigation, [path.join(root, 'src/app/merchant/orders/actions.ts')]: actions, '@/app/merchant/orders/actions': actions, '@/app/superadmin/sales/orders/actions': actions, '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="admin-shell"><main class="p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function fixture(t, width = 1024, height = 768, extra = {}) {
  const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
  const page = await context.newPage(), calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({suspended}) => {
    window.__audioGains = []; window.__audioStarts = 0; window.__audioNotes = []; window.__audioStops = [];
    window.AudioContext = class {
      state = suspended ? 'suspended' : 'running'; currentTime = 0; destination = {};
      async resume() { this.state = 'running'; } async close() {}
      createOscillator() { return { frequency: { setValueAtTime(value, at) { window.__audioNotes.push({value, at}); } }, connect() {}, start() { window.__audioStarts++; }, stop(at) { window.__audioStops.push(at); }, disconnect() {} }; }
      createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value) { window.__audioGains.push(value); } } }; }
    };
  }, {suspended: !!extra.suspendedAudio});
  const state = { orders: [order('ORD-NEW'), order('ORD-COOK', { status: 'In Progress' }), order('ORD-READY', { status: 'Ready' }), order('ORD-UNPAID', { status: 'Ready', paymentStatus: 'Pending', paymentMethod: 'PayAtPickup' }), order('ORD-HISTORY', { status: 'Completed' }), order('ORD-FUTURE', { fulfillmentAt: '2026-10-26T12:15:00.000Z' })], readStatus: 200, statusError: null, canEdit: true, emptyPage: false, ...extra };
  await page.exposeFunction('__registerPayment', async (id, method) => { calls.push({ kind: 'payment', id, method }); state.orders.find(o => o.id === id).paymentStatus = 'Paid'; return { success: true, message: 'Betalingen er registreret.' }; });
  if (extra.kitchenMode) await page.addInitScript(() => { window.__kitchenMode = true; });
  if (extra.kds) await page.addInitScript(({kitchenMode}) => { window.__kdsProps = { kitchenMode, initialLocations:[{brandId:'brand-a',locationId:'loc-a',brandName:'Esmeralda',locationName:'Amager'}], apiBase:'/api/kds/orders', actionApiBase:'/api/merchant/orders' }; }, {kitchenMode: !!extra.kitchenMode});
  await page.route(/\/api\/(merchant|kds)\/orders/,  async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/merchant/orders/ready-time') {
      const command = req.postDataJSON(); calls.push({kind:'ready-time',command});
      const row = state.orders.find(o => o.id === command.orderId);
      if (state.timeError) return route.fulfill({status:409,json:{success:false,message:'Ordren eller tiden er ændret. Opdater og prøv igen.'}});
      assert.equal(command.expectedReadyAt,row.kitchenReadyAt ?? null);row.kitchenReadyAt=command.readyAt;
      return route.fulfill({json:{success:true,readyAt:command.readyAt}});
    }
    if (url.pathname === '/api/merchant/orders/status') {
      const command = req.postDataJSON(); calls.push({ kind: 'status', command });
      if (state.statusError) return route.fulfill({ status: state.statusError.status, json: { success: false, error: state.statusError.error, message: state.statusError.message } });
      const row = state.orders.find(o => o.id === command.orderId);
      assert.ok(row, 'fixture only accepts known order');
      assert.equal(command.brandId, row.brandId); assert.equal(command.locationId, row.locationId); assert.equal(command.expectedStatus, row.status);
      row.status = command.status; return route.fulfill({ json: { success: true, changed: true, orderId: row.id, status: row.status } });
    }
    if (url.pathname === '/api/merchant/orders/reprint') return route.fulfill({ status: 403, json: { error: 'forbidden' } });
    if (url.pathname !== '/api/merchant/orders' && url.pathname !== '/api/kds/orders') throw Error('Unexpected fixture endpoint ' + url.pathname);
    if (state.readDelay) await new Promise(resolve=>setTimeout(resolve,state.readDelay));
    calls.push({ kind: 'read', path:url.pathname, query: Object.fromEntries(url.searchParams) });
    if (state.historyReadStatus && url.searchParams.get('view') === 'history') return route.fulfill({status:state.historyReadStatus,json:{error:'terminal_unavailable'}});
    if (state.boardReadStatus && url.searchParams.get('view') === 'board') return route.fulfill({status:state.boardReadStatus,json:{error:'forbidden'}});
    if (state.failOnce) {state.failOnce=false;return route.fulfill({status:503,json:{error:'terminal_unavailable'}});}
    if (state.readStatus !== 200) return route.fulfill({ status: state.readStatus, json: { error: state.readStatus === 401 ? 'unauthorized' : 'terminal_unavailable', message: 'Ordrene kunne ikke hentes.' } });
    if (state.initialRevoked && url.searchParams.get('brandId') === 'brand-a') return route.fulfill({status:403,json:{error:'forbidden'}});
    const locationId = url.searchParams.get('locationId') || (state.initialRevoked ? 'loc-b' : 'loc-a'), scope = locations.find(l => l.locationId === locationId), view = url.searchParams.get('view') || 'board';
    let rows = state.orders.filter(o => o.locationId === locationId);
    const serviceDate=url.searchParams.get('serviceDate');if(serviceDate) rows=rows.filter(o=>(o.fulfillmentAt || o.createdAt).slice(0,10)===serviceDate);
    rows = rows.filter(o => view === 'history' ? (['Completed','Delivered','Canceled'].includes(o.status) || o.managedDeliveryTracking?.deliveryStatus === 'delivered') : view === 'preorders' ? o.fulfillmentAt > '2026-10-25T23:00:00.000Z' : !['Completed','Delivered','Canceled'].includes(o.status) && o.fulfillmentAt < '2026-10-25T23:00:00.000Z');
    const hasMore = state.emptyPage && !url.searchParams.has('cursor');
    const result = { orders: hasMore ? [] : rows, locations, selectedBrandId: scope.brandId, selectedLocationId: scope.locationId, canEdit: state.canEdit, serverTime: state.dynamicTime ? await page.evaluate(()=>new Date().toISOString()) : now, hasMore, nextCursor: hasMore ? 'fixture-next' : null };
    if (state.holdHistory && view === 'history') { state.heldHistory = {route,result}; return; }
    return route.fulfill({ json: result });
  });
  if (state.fakeClock) await page.clock.install({time:new Date(now)});
  await page.goto(origin); await expect(page.getByRole('button', { name: 'Opdater', exact: true })).toBeVisible();
  return { page, state, calls, errors };
}
for (const [width, height] of [[1024,768],[768,1024]]) {
  test(`terminal board is touch usable at ${width}×${height}`, async t => {
    const { page, errors } = await fixture(t, width, height);
    await expect(page.getByRole('region', { name: 'Nye ordrer', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tilberedes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Åbn ordre ORD-FUTURE', exact: true })).toHaveCount(0);
    const box = await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).boundingBox(); assert.ok(box.height >= 44, 'order target at least44px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page horizontal overflow');
    if (process.env.TERMINAL_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.TERMINAL_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TERMINAL_SCREENSHOT_DIR, `terminal-${width}x${height}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog')).toContainText('Ekstra svampe'); await expect(page.getByRole('dialog')).toContainText('Ingen løg');
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); assert.deepEqual(errors, []);
  });
}
test('terminal progresses a paid pickup through authoritative status API', async t => {
  const { page, state, calls } = await fixture(t);
  await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).click();
  for (const [label, status] of [['Start tilberedning','In Progress'],['Markér klar','Ready'],['Markér afhentet','Completed']]) {
    await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    await expect.poll(() => state.orders.find(o => o.id === 'ORD-NEW').status).toBe(status);
  }
  const writes = calls.filter(c => c.kind === 'status'); assert.equal(writes.length,3); assert.equal(new Set(writes.map(w=>w.command.requestId)).size,3);
  for (const write of writes) assert.match(write.command.requestId,/^[0-9a-f-]{36}$/i);
});
test('history and preorders are separate views; context switch clears old restaurant', async t => {
  const { page, calls } = await fixture(t);
  await page.getByRole('button', { name: 'Historik', exact: true }).click(); await expect(page.getByText('ORD-HISTORY', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('ORD-NEW', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Forudbestillinger', exact: true }).click(); await expect(page.getByText('ORD-FUTURE', { exact: true }).first()).toBeVisible();
  await page.getByRole('combobox', { name: 'Restaurant', exact: true }).selectOption('brand-b/loc-b');
  await expect.poll(() => calls.filter(c=>c.kind==='read').at(-1).query.locationId).toBe('loc-b');
  await expect(page.getByText('ORD-FUTURE', { exact: true })).toHaveCount(0);
});
test('failed refresh is visible and explicit refresh recovers', async t => {
  const { page, state } = await fixture(t);
  await expect(page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true })).toBeVisible();
  state.readStatus = 503; await page.getByRole('button', { name: 'Opdater', exact: true }).click(); await expect(page.getByRole('alert').first()).toBeVisible();
  state.readStatus = 200; await page.getByRole('button', { name: 'Opdater', exact: true }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('revoked access removes stale order details and edit controls', async t => {
  const { page, state } = await fixture(t);
  await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  state.readStatus = 403; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('board automatically traverses empty first scan page', async t => {
  const { page, calls } = await fixture(t,1024,768,{emptyPage:true});
  await expect(page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true })).toBeVisible();
  assert.equal(calls.filter(c=>c.kind==='read').at(-1).query.cursor,'fixture-next');
});
test('conflict is explained and never shown as successful progression', async t => {
  const { page, state } = await fixture(t,1024,768,{statusError:{status:409,error:'terminal_status_conflict',message:'Ordren er ændret. Opdater og prøv igen.'}});
  await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).click();
  await page.getByRole('dialog').getByRole('button',{name:'Start tilberedning',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ordren er ændret');
  assert.equal(state.orders.find(o=>o.id==='ORD-NEW').status,'Received');
});
test('unpaid pickup completion requires explicit separate payment confirmation', async t => {
  const { page, state, calls } = await fixture(t);
  await page.getByRole('button', { name: 'Åbn ordre ORD-UNPAID', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'Markér afhentet',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Registrér betaling',exact:true}).click();
  assert.equal(calls.filter(c=>c.kind==='payment').length,0,'opening confirmation never settles payment');
  await dialog.getByRole('button',{name:'Bekræft betaling modtaget',exact:true}).click();
  await expect.poll(()=>state.orders.find(o=>o.id==='ORD-UNPAID').paymentStatus).toBe('Paid');
  await expect(dialog.getByRole('button',{name:'Markér afhentet',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'Markér afhentet',exact:true}).click();
  await expect.poll(()=>state.orders.find(o=>o.id==='ORD-UNPAID').status).toBe('Completed');
  assert.equal(calls.filter(c=>c.kind==='payment').length,1);
});
test('read-only permission renders details without mutation controls', async t => {
  const { page, calls } = await fixture(t,1024,768,{canEdit:false});
  await page.getByRole('button', { name: 'Åbn ordre ORD-NEW', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Du har læseadgang');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Start tilberedning',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Genprint ordre')).toHaveCount(0);
  assert.equal(calls.filter(c=>c.kind==='status'||c.kind==='payment').length,0);
});
test('history submits search and date filters to scoped read endpoint', async t => {
  const { page, calls } = await fixture(t);
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await page.getByLabel('Søg ordre eller kunde',{exact:true}).fill('ORD-HISTORY');
  await page.getByLabel('Bestillingsdato fra',{exact:true}).fill('2026-10-24');
  await page.getByLabel('Bestillingsdato til',{exact:true}).fill('2026-10-25');
  await page.getByRole('button',{name:'Søg',exact:true}).click();
  await expect.poll(()=>calls.filter(c=>c.kind==='read').at(-1).query.search).toBe('ORD-HISTORY');
  const query=calls.filter(c=>c.kind==='read').at(-1).query;
  assert.equal(query.view,'history'); assert.equal(query.dateFrom,'2026-10-24'); assert.equal(query.dateTo,'2026-10-25');
});
test('first load is silent; new board orders alert once even while history is open', async t => {
  const { page, state } = await fixture(t);
  await expect(page.getByRole('button',{name:'Åbn ordre ORD-NEW',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__audioStarts),0);
  await page.getByText('Lydindstillinger · Til · 80%',{exact:true}).click();
  await page.getByRole('button',{name:'Test lyd',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1,'explicit sound test');
  assert.equal(await page.evaluate(()=>window.__audioNotes.length),8);
  assert.ok(await page.evaluate(()=>new Set(window.__audioNotes.map(n=>n.value)).size)>1);
  assert.equal(await page.evaluate(()=>window.__audioStops[0]),3.6);
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  state.orders.push(order('ORD-NEW-LATER'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(2);
  await expect(page.getByText('Der er kommet en ny ordre',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'Ordrer',exact:true}).click();
  await expect(page.getByRole('button',{name:'Åbn ordre ORD-NEW-LATER',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__audioStarts),2,'same order must not alert again');
});
test('background board access revocation hides historical customer data without a history refresh', async t => {
  const { page, state, calls } = await fixture(t);
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  const historyReads = calls.filter(c=>c.kind==='read'&&c.query.view==='history').length;
  state.boardReadStatus=403;
  await expect(page.getByRole('alert').first()).toContainText('adgang',{timeout:20000});
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  assert.equal(calls.filter(c=>c.kind==='read'&&c.query.view==='history').length,historyReads,'only background poll detected revocation');
});
test('initial automatic restaurant is pinned when its grant is revoked and another remains', async t => {
  const { page, state, calls } = await fixture(t);
  await expect(page.getByRole('button',{name:'Åbn ordre ORD-NEW',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  const historyReads=calls.filter(c=>c.kind==='read'&&c.query.view==='history').length;
  const before=calls.length;
  state.initialRevoked=true;
  // A no-scope backend read now legitimately resolves to remaining restaurant B.
  // The terminal must instead keep its resolved A scope and receive403.
  await expect.poll(()=>calls.slice(before).some(c=>c.kind==='read'&&c.query.view==='board'),{timeout:20000}).toBe(true);
  const boardRead=calls.slice(before).find(c=>c.kind==='read'&&c.query.view==='board');
  assert.equal(boardRead.query.brandId,'brand-a','initial resolution must become explicit authority context');
  assert.equal(boardRead.query.locationId,'loc-a');
  await expect(page.getByRole('alert').first()).toContainText('adgang');
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  assert.equal(calls.filter(c=>c.kind==='read'&&c.query.view==='history').length,historyReads,'no history refresh hides the bug');
});
test('native fullscreen includes the actual Radix order dialog and its controls', async t => {
  const { page, errors } = await fixture(t);
  await expect(page.getByRole('button',{name:'Åbn ordre ORD-NEW',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fuld skærm',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByRole('button',{name:'Åbn ordre ORD-NEW',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
  assert.equal(await dialog.evaluate(element=>document.fullscreenElement?.contains(element)),true,'body portal must be inside fullscreen top layer');
  assert.equal(await dialog.evaluate(element=>Number(getComputedStyle(element).zIndex)>Number(getComputedStyle(document.querySelector('[data-kds-fullscreen]')).zIndex)),true,'dialog must render above the opaque immersive surface');
  await dialog.getByRole('button',{name:'Start tilberedning',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Markér klar',exact:true})).toBeVisible();
  await page.evaluate(()=>document.exitFullscreen());
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
  await expect(dialog).toBeVisible(); assert.deepEqual(errors,[]);
});
test('background denial remains latched across transient failures until authorization succeeds', async t => {
  const { page, state, calls } = await fixture(t,1024,768,{fakeClock:true});
  await expect(page.getByRole('button',{name:'Opdater',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Vis ordre ORD-HISTORY',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Syntetisk kunde');
  const historyReads=calls.filter(c=>c.kind==='read'&&c.query.view==='history').length;
  state.boardReadStatus=403;
  await page.clock.fastForward(15001);
  await expect(page.getByRole('alert').first()).toContainText('adgang');
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  state.boardReadStatus=503;
  const transient = page.waitForResponse(response => response.url().includes('/api/merchant/orders?') && response.status() === 503);
  await page.clock.fastForward(15001);
  await (await transient).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert').first()).toContainText('adgang');
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  assert.equal(calls.filter(c=>c.kind==='read'&&c.query.view==='history').length,historyReads,'transient board failure must not reveal cached history');
  // Only a new successful authorization/read can recover the terminal.
  state.boardReadStatus=0;
  await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.ok(calls.filter(c=>c.kind==='read'&&c.query.view==='history').length>historyReads,'recovery must re-read history');
});
test('a history read started before denial cannot authorize cached data after board recovery', async t => {
  const {page,state,calls}=await fixture(t,1024,768,{fakeClock:true});
  await expect(page.getByRole('button',{name:'Opdater',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Historik',exact:true}).click();
  await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();
  state.holdHistory=true; state.boardReadStatus=403;
  await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect.poll(()=>!!state.heldHistory).toBe(true);
  await expect(page.getByRole('alert').first()).toContainText('adgang');
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  await page.evaluate(()=>{
    window.__piiReturned=false;
    new MutationObserver(()=>{if(document.body.textContent.includes('ORD-HISTORY'))window.__piiReturned=true;}).observe(document.body,{childList:true,subtree:true,characterData:true});
  });
  state.boardReadStatus=0;
  const boardSuccess=page.waitForResponse(response=>new URL(response.url()).searchParams.get('view')==='board'&&response.status()===200);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await (await boardSuccess).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  state.holdHistory=false; state.historyReadStatus=503;
  const historyFailure=page.waitForResponse(response=>new URL(response.url()).searchParams.get('view')==='history'&&response.status()===503);
  await state.heldHistory.route.fulfill({json:state.heldHistory.result});
  await (await historyFailure).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByText('ORD-HISTORY',{exact:true})).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.__piiReturned),false,'old in-flight success must never restore historical PII');
  assert.ok(calls.filter(c=>c.kind==='read'&&c.query.view==='history').length>=3,'history requires a new post-denial read');
});
test('managed ready delivery shows courier state and cannot be manually completed',async t=>{
 const managed=order('ORD-MANAGED',{deliveryType:'Delivery',status:'Ready',managedDelivery:true,managedDeliveryTracking:{orderId:'ORD-MANAGED',bookingState:'accepted',deliveryStatus:'courier_to_pickup',paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}});
 const {page,calls}=await fixture(t,768,1024,{orders:[managed]});await page.getByRole('button',{name:'Åbn ordre ORD-MANAGED',exact:true}).click();await expect(page.getByRole('heading',{name:'Leveringsstatus',exact:true})).toBeVisible();await expect(page.getByText('Kurér på vej til restauranten')).toBeVisible();await expect(page.getByRole('button',{name:'Markér leveret',exact:true})).toHaveCount(0);await expect(page.getByText('Ordren er klar i køkkenet. Afhentning og levering opdateres fra kuréren.')).toBeVisible();assert.equal(calls.filter(c=>c.kind==='status').length,0);
});


test('managed delivered refresh removes ready card while history remains accessible',async t=>{
 const managed=order('ORD-DONE',{deliveryType:'Delivery',status:'Ready',managedDelivery:true,managedDeliveryTracking:{orderId:'ORD-DONE',bookingState:'accepted',deliveryStatus:'picked_up',paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}});
 const {page,state,calls,errors}=await fixture(t,768,1024,{orders:[managed],emptyPage:true});
 await expect(page.getByRole('button',{name:'Åbn ordre ORD-DONE',exact:true})).toBeVisible();
 state.orders[0].managedDeliveryTracking.deliveryStatus='delivered';
 await page.getByRole('button',{name:'Opdater',exact:true}).click();
 await expect(page.getByRole('button',{name:'Åbn ordre ORD-DONE',exact:true})).toHaveCount(0);
 assert.ok(calls.filter(c=>c.kind==='read'&&c.query.cursor==='fixture-next').length>=2);
 assert.equal(state.orders[0].status,'Ready');
 await page.getByRole('button',{name:'Historik',exact:true}).click();
 // History pages are explicitly paged; the empty first scan retains its cursor.
 const more=page.getByRole('button',{name:'Hent flere ordrer',exact:true});
 await expect(more).toBeVisible();await more.click();
 await expect(page.getByText('ORD-DONE',{exact:true}).first()).toBeVisible();
 assert.equal(calls.filter(c=>c.kind==='status').length,0);assert.deepEqual(errors,[]);
});

// Option quantities are per parent item; display the canonical snapshot verbatim.
test('terminal preserves quantity and removal labels without reversing exclusions', async t => {
  const { page, calls, errors } = await fixture(t,1024,768,{orders:[order('ORD-OPTIONS',{
    items:[{name:'Pizza',quantity:2,unitPrice:64.5,totalPrice:129,modifiers:['2 × Ost','Uden løg']}],
  })]});
  await page.getByRole('button',{name:'Åbn ordre ORD-OPTIONS',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('2 × Ost',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Uden løg',{exact:true})).toBeVisible();
  await expect(dialog.getByText('2× Pizza',{exact:true})).toBeVisible();
  assert.doesNotMatch(await dialog.innerText(), /\+ Uden løg|\+ 2 × Ost|4 × Ost/);
  assert.equal(calls.filter(c=>c.kind==='status'||c.kind==='payment').length,0);
  assert.deepEqual(errors,[]);
});
test('KDS shows Esmeralda before order response and uses scoped read with existing employee payment/status actions',async t=>{
 const {page,state,calls}=await fixture(t,1024,768,{kds:true,readDelay:1200});
 await expect(page.getByText('Esmeralda · Amager',{exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Restaurant'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Tilbage til oversigt'})).toHaveCount(0);
 await page.getByRole('button',{name:'Åbn ordre ORD-UNPAID',exact:true}).click();
 await page.getByRole('button',{name:'Registrér betaling',exact:true}).click();
 await page.getByRole('button',{name:'Bekræft betaling modtaget',exact:true}).click();
 await expect.poll(()=>state.orders.find(o=>o.id==='ORD-UNPAID').paymentStatus).toBe('Paid');
 assert.equal(calls.filter(c=>c.kind==='payment').length,1);
 for(const call of calls.filter(c=>c.kind==='read')){assert.equal(call.path,'/api/kds/orders');assert.equal(call.query.brandId,'brand-a');assert.equal(call.query.locationId,'loc-a');assert.equal(call.query.brandName,undefined);}
});
test('sound defaults on, test plays melody at saved volume, mute persists after reload',async t=>{
 const {page}=await fixture(t);
 await expect(page.getByRole('button',{name:'Slå lyd fra',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),0);
 await page.getByText('Lydindstillinger · Til · 80%',{exact:true}).click();
 await page.getByRole('slider',{name:'Lydstyrke'}).fill('40');
 await page.getByRole('button',{name:'Test lyd',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1);
 assert.equal(await page.evaluate(()=>Math.max(...window.__audioGains)),0.06);
 await page.reload();await expect(page.getByText('Lydindstillinger · Til · 40%',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Slå lyd fra',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Slå lyd til',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),0);
});
test('suspended autoplay is visible and Test lyd unlocks the melody',async t=>{
 const {page}=await fixture(t,1024,768,{suspendedAudio:true});
 await expect(page.getByText('Tryk på “Test lyd” for at aktivere lyden på denne enhed.',{exact:true})).toBeVisible();
 await page.getByText('Lydindstillinger · Til · 80%',{exact:true}).click();await page.getByRole('button',{name:'Test lyd',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1);
 await expect(page.getByText('Tryk på “Test lyd” for at aktivere lyden på denne enhed.',{exact:true})).toHaveCount(0);
});
test('new orders play automatically by default, volume zero and mute suppress alerts',async t=>{
 const {page,state}=await fixture(t);await expect(page.getByRole('button',{name:'Åbn ordre ORD-NEW',exact:true})).toBeVisible();
 state.orders.push(order('AUTO-ONE'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1);
 await page.getByText('Lydindstillinger · Til · 80%',{exact:true}).click();await page.getByRole('slider',{name:'Lydstyrke'}).fill('0');
 state.orders.push(order('AUTO-TWO'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'Åbn ordre AUTO-TWO',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),1);
 await page.getByRole('slider',{name:'Lydstyrke'}).fill('80');await page.getByRole('button',{name:'Slå lyd fra',exact:true}).click();
 state.orders.push(order('AUTO-THREE'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'Åbn ordre AUTO-THREE',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),1);
});
test('kitchen cards show all details and large progress buttons without dialogs; today filter excludes old active orders',async t=>{
 const {page,state,calls}=await fixture(t,1024,768,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true});
 const card=page.getByRole('article',{name:'Ordre ORD-NEW',exact:true});await expect(card).toBeVisible();
 await expect(card.getByText('15:00',{exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 const button=card.getByRole('button',{name:'Start tilberedning',exact:true});assert.ok((await button.boundingBox()).height>=56);await button.click();await expect(card.getByRole('button',{name:'Markér klar',exact:true})).toBeVisible();await card.getByRole('button',{name:'Markér klar',exact:true}).click();await expect(card.getByRole('button',{name:'Markér afhentet',exact:true})).toBeVisible();
 state.orders.push(order('OLD-ACTIVE',{fulfillmentAt:'2026-10-24T12:00:00.000Z'}));await page.getByRole('button',{name:'Opdater',exact:true}).click();await expect(page.getByRole('article',{name:'Ordre OLD-ACTIVE',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Ordredato',{exact:true})).toHaveValue('2026-10-25');await page.getByLabel('Ordredato',{exact:true}).fill('2026-10-24');await expect(page.getByRole('article',{name:'Ordre OLD-ACTIVE',exact:true})).toBeVisible();await expect(card).toHaveCount(0);
 assert.equal(calls.filter(c=>c.kind==='read').at(-1).query.serviceDate,'2026-10-24');await page.getByRole('button',{name:'I dag',exact:true}).click();await expect(card).toBeVisible();
 await page.screenshot({path:'/tmp/kds-kitchen-preview.png',fullPage:true});
});
test('kitchen menu selects and persists sounds, threshold and volume',async t=>{
 const {page}=await fixture(t,1024,768,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true});
 await expect(page.getByLabel('Vælg lyd',{exact:true})).not.toBeVisible();await page.getByText(/Menu · Lyd og køkkenindstillinger/).click();
 await page.getByLabel('Vælg lyd',{exact:true}).selectOption('marimba');await page.getByLabel('Alarm efter minutter',{exact:true}).fill('8');await page.getByRole('slider',{name:'Lydstyrke'}).fill('60');
 await page.getByRole('button',{name:'Test lyd',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__audioNotes[0]?.value)).toBe(392);
 await page.reload();await page.getByText(/Menu · Lyd og køkkenindstillinger/).click();await expect(page.getByLabel('Vælg lyd',{exact:true})).toHaveValue('marimba');await expect(page.getByLabel('Alarm efter minutter',{exact:true})).toHaveValue('8');await expect(page.getByRole('slider',{name:'Lydstyrke'})).toHaveValue('60');
});
test('clock edits are inline, save server time and preserve customer fulfillment time',async t=>{
 const {page,state,calls}=await fixture(t,1024,768,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true});
 const card=page.getByRole('article',{name:'Ordre ORD-NEW',exact:true});await card.getByRole('button',{name:'Ændr klartid for ORD-NEW',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await card.getByLabel('Klar om minutter for ORD-NEW',{exact:true}).fill('40');await card.getByRole('button',{name:'Gem klartid',exact:true}).click();await expect.poll(()=>calls.filter(c=>c.kind==='ready-time').length).toBe(1);
 await expect(card.getByText('40:00',{exact:true})).toBeVisible();assert.equal(state.orders.find(o=>o.id==='ORD-NEW').fulfillmentAt,'2026-10-25T12:15:00.000Z');
 state.timeError=true;await card.getByRole('button',{name:'Ændr klartid for ORD-NEW',exact:true}).click();await card.getByLabel('Klar om minutter for ORD-NEW',{exact:true}).fill('50');await card.getByRole('button',{name:'Gem klartid',exact:true}).click();await expect(card.getByRole('alert')).toContainText('tiden er ændret');
});
test('overdue clock is negative and sounds alarm, marking ready stops repeated alarms',async t=>{
 const late=order('LATE',{fulfillmentAt:'2026-10-25T11:54:00.000Z'});
 const {page}=await fixture(t,1024,768,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true,orders:[late]});const card=page.getByRole('article',{name:'Ordre LATE',exact:true});
 await expect(card.getByText('−6:00',{exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1);
 await card.getByRole('button',{name:'Start tilberedning',exact:true}).click();await expect(card.getByRole('button',{name:'Markér klar',exact:true})).toBeVisible();await card.getByRole('button',{name:'Markér klar',exact:true}).click();await expect(card.getByText('Klar ✓',{exact:true})).toBeVisible();
 await page.clock.runFor(61_000);await expect(card.getByText('Klar ✓',{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),1);
});
test('immersive kitchen persists through scroll and native exit until its close button',async t=>{
 const {page}=await fixture(t,768,1024,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true});await page.getByRole('button',{name:'Fuld skærm',exact:true}).click();
 const screen=page.locator('[data-kds-fullscreen]');await expect(screen).toHaveAttribute('data-kds-fullscreen','true');await page.mouse.wheel(0,600);await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});await expect(screen).toHaveAttribute('data-kds-fullscreen','true');
 assert.equal(await screen.evaluate(el=>getComputedStyle(el).overscrollBehavior),'none');await page.getByRole('button',{name:'Luk fuld skærm',exact:true}).click();await expect(screen).toHaveAttribute('data-kds-fullscreen','false');
});
test('history remains connected after 45 seconds and one transient refresh retries without a false error banner',async t=>{
 const {page,state,calls}=await fixture(t,1024,768,{fakeClock:true,dynamicTime:true});await page.getByRole('button',{name:'Historik',exact:true}).click();await expect(page.getByText('ORD-HISTORY',{exact:true}).first()).toBeVisible();await page.clock.runFor(61_000);
 await expect(page.getByText('Forbindelsen skal kontrolleres',{exact:true})).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
 const before=calls.filter(c=>c.kind==='read').length;state.failOnce=true;await page.getByRole('button',{name:'Opdater',exact:true}).click();await expect.poll(()=>calls.filter(c=>c.kind==='read').length).toBeGreaterThan(before+1);await expect(page.getByRole('alert')).toHaveCount(0);
});
test('overdue threshold is configurable and alarm repeats at most once a minute',async t=>{
 const {page}=await fixture(t,1024,768,{kds:true,kitchenMode:true,fakeClock:true,dynamicTime:true,orders:[order('LATE',{fulfillmentAt:'2026-10-25T11:56:00.000Z'})]});
 await expect(page.getByRole('article',{name:'Ordre LATE',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__audioStarts),0);
 await page.getByText(/Menu · Lyd og køkkenindstillinger/).click();await page.getByLabel('Alarm efter minutter',{exact:true}).fill('3');await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(1);
 await page.clock.runFor(59_000);assert.equal(await page.evaluate(()=>window.__audioStarts),1);await page.clock.runFor(2_000);await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(2);
 await page.getByRole('button',{name:'Slå lyd fra',exact:true}).click();await page.clock.runFor(61_000);assert.equal(await page.evaluate(()=>window.__audioStarts),2);
});
