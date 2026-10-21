// The actual QR manager component with a synthetic HTTP API. This verifies
// interaction and request contracts, not server authorization or live QA.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const root = process.cwd();
let server, browser, origin;
const draft = { name: 'Bord 1', brandId: 'b1', locationId: 'l1', kind: 'dynamic', destination: 'https://example.com/menu', staticType: 'url', fields: {}, campaign: 'Oktober', tags: ['bord'], utm: { source: 'restaurant', medium: 'qr', campaign: '', content: '', term: '' } };
const row = { ...draft, id: 'qr1', revision: 'rev1', status: 'active', publicUrl: 'https://orderfly.dk/q/abc' };
const brands = [{ id: 'b1', name: 'Esmeralda', locations: [{ id: 'l1', name: 'Amager' }] }, { id: 'b2', name: 'Andet brand', allowWholeBrand: false, locations: [{ id: 'l2', name: 'Afdeling 2' }] }];
const capabilities = { create: true, edit: true, archive: true, export: true };

before(async () => {
  const source = fs.readFileSync(path.join(root, 'src/app/superadmin/qr-codes/qr-manager.tsx'), 'utf8');
  const component = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const reactDir = path.dirname(require.resolve('react/package.json')), domDir = path.dirname(require.resolve('react-dom/package.json'));
  const boot = `
    const options=new URLSearchParams(location.search), caps=options.has('readonly')?{create:false,edit:false,archive:false,export:false}:${JSON.stringify(capabilities)};
    window.__calls=[];
    async function invoke(action,data){ const response=await fetch('/api/qr/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...data})}); const body=await response.json(); if(!response.ok)throw body; return body; }
    const api={save:(draft,context)=>invoke('save',{draft,context}),setStatus:(id,status,context)=>invoke('status',{id,status,context}),preview:(draft,context)=>invoke('preview',{draft,context}),download:(draft,format,context)=>invoke('download',{draft,format,context})};
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.QrManager,{brands:${JSON.stringify(brands)},initialCodes:[${JSON.stringify(row)}],capabilities:caps,api}));`;
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.url === '/react.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(reactDir, 'umd/react.development.js'))); }
    if (req.url === '/react-dom.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(domDir, 'umd/react-dom.development.js'))); }
    if (req.url === '/component.js') { res.setHeader('content-type', 'application/javascript'); return res.end('window.module={exports:{}};window.exports=module.exports;window.require=name=>{if(name!=="react")throw Error(name);return React};\n' + component + '\n' + boot); }
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/component.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open({ width = 390, answers = [], readonly = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }), calls = [];
  page.setDefaultTimeout(5000);
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.route('**/api/qr/test', async route => {
    const data = route.request().postDataJSON(); calls.push(data);
    const answer = answers.shift();
    if (answer === 'abort') return route.abort('internetdisconnected');
    if (typeof answer === 'function') return answer(route, data);
    const status = answer?.[0] ?? 200;
    const body = answer?.[1] ?? (data.action === 'save' ? { ...data.draft, id: data.context.id || 'new-qr', revision: 'rev2', status: 'active' } : { ...row, status: data.status, revision: 'rev2' });
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + (readonly ? '/?readonly' : '/'));
  assert.deepEqual(browserErrors, [], 'the component must mount without browser errors');
  await page.getByRole('heading', { name: 'QR-koder', exact: true }).waitFor();
  return { page, calls };
}

for (const width of [390, 1440]) test(`create and edit carry selected scope and revision at ${width}px`, async () => {
  const { page, calls } = await open({ width });
  try {
    await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Flyer');
    await page.getByLabel('Brand', { exact: true }).selectOption('b2');
    assert.equal(await page.getByLabel('Placering', { exact: true }).inputValue(), 'l2');
    assert.equal(await page.getByLabel('Placering', { exact: true }).getByRole('option', { name: 'Hele brandet', exact: true }).count(), 0);
    await page.getByLabel('Placering', { exact: true }).selectOption('l2');
    await page.getByLabel('Webadresse', { exact: true }).fill('https://example.com/flyer');
    await page.getByLabel('Udløbsdato', { exact: false }).fill('2026-10-25');
    assert.equal(await page.getByRole('button', { name: 'Download PNG' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Gem QR-kode' }).click();
    await page.getByRole('status').filter({ hasText: 'QR-koden er gemt.' }).waitFor();
    assert.equal(calls[0].draft.brandId, 'b2'); assert.equal(calls[0].draft.locationId, 'l2'); assert.match(calls[0].context.requestId, /^[a-f0-9-]{36}$/);
    assert.equal(calls[0].draft.expiresAt, Date.parse('2026-10-24T22:00:00Z'));
    assert.equal('id' in calls[0].context, false);
    await page.getByRole('button', { name: 'Redigér Flyer', exact: true }).click();
    assert.equal(await page.getByLabel('Brand', { exact: true }).isDisabled(), true);
    await page.getByLabel('Navn', { exact: true }).fill('Flyer 2');
    await page.getByRole('button', { name: 'Gem QR-kode' }).click();
    await page.getByRole('heading', { name: 'Flyer 2', exact: true }).waitFor();
    assert.equal(calls[1].context.id, 'new-qr'); assert.equal(calls[1].context.revision, 'rev2');
    assert.equal('id' in calls[1].draft, false);
  } finally { await page.close(); }
});

test('uncertain save preserves fields and retries exact idempotency key without a new action', async () => {
  const { page, calls } = await open({ answers: ['abort'] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Bevar felter');
    await page.getByRole('button', { name: 'Gem QR-kode' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Navn', { exact: true }).inputValue(), 'Bevar felter');
    assert.equal(await page.getByLabel('Navn', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Annullér', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).click();
    await page.getByRole('heading', { name: 'Bevar felter', exact: true }).waitFor();
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  } finally { await page.close(); }
});

test('revision conflict retains input and allows safe cancellation', async () => {
  const { page, calls } = await open({ answers: [[409, { code: 'revision_conflict' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Konflikt');
    await page.getByRole('button', { name: 'Gem QR-kode' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Navn', { exact: true }).inputValue(), 'Konflikt');
    await page.getByRole('button', { name: 'Annullér', exact: true }).click();
    assert.equal(await page.getByRole('form', { name: 'Redigér QR-kode' }).count(), 0); assert.equal(calls.length, 1);
  } finally { await page.close(); }
});

test('a denied replay cannot clear an earlier uncertain save and every retry keeps the first request', async () => {
  const { page, calls } = await open({ answers: ['abort', [403, { code: 'forbidden' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Du har ikke adgang' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Annullér', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).click();
    await page.getByRole('form', { name: 'Redigér QR-kode', exact: true }).waitFor({ state: 'detached' });
    assert.equal(calls.length, 3); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[0], calls[2]);
  } finally { await page.close(); }
});

test('duplicate opens an unsaved copy and archive requires confirmation', async () => {
  const { page, calls } = await open();
  try {
    await page.getByRole('button', { name: 'Duplikér Bord 1', exact: true }).click();
    assert.equal(await page.getByLabel('Navn', { exact: true }).inputValue(), 'Bord 1 (kopi)');
    assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Annullér', exact: true }).click();
    await page.getByRole('button', { name: 'Arkivér Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Fortryd', exact: true }).click(); assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Arkivér Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Bekræft arkivering', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Status er opdateret.' }).waitFor();
    assert.equal(calls[0].status, 'archived'); assert.equal(calls[0].context.revision, 'rev1');
    assert.equal(await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).count(), 0);
  } finally { await page.close(); }
});

test('static Wi-Fi preview passes structured fields, and readonly hides mutation controls', async () => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cCuoAAAAASUVORK5CYII=';
  const { page, calls } = await open({ answers: [[200, { imageUrl: pixel, payload: 'WIFI:test' }]] });
  try {
    await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).click();
    await page.getByLabel('Kodetype', { exact: true }).selectOption('static');
    await page.getByLabel('Indholdstype', { exact: true }).selectOption('wifi');
    assert.equal(await page.getByRole('combobox', { name: 'Sikkerhed (WPA, WEP eller nopass)', exact: true }).inputValue(), 'WPA');
    await page.getByLabel('Netværksnavn', { exact: true }).fill('Esmeralda');
    await page.getByLabel('Wi-Fi-adgangskode', { exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: 'Vis eksempel', exact: true }).click();
    await page.getByRole('img', { name: 'Eksempel på QR-kode' }).waitFor();
    assert.equal(calls[0].draft.kind, 'static'); assert.equal(calls[0].draft.fields.ssid, 'Esmeralda');
    assert.equal(calls[0].draft.fields.security, 'WPA');
  } finally { await page.close(); }
  const readonly = await open({ readonly: true });
  try { assert.equal(await readonly.page.getByRole('button').count(), 0); } finally { await readonly.page.close(); }
});

test('preview rejects cross-origin assets and download includes saved code identity', async () => {
  const { page, calls } = await open({ answers: [[200, { imageUrl: 'https://evil.example/track.png', payload: 'secret' }], [200, { url: '/qr-test.png', filename: 'qr.png' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Vis eksempel', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('img').count(), 0);
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Download er klar.' }).waitFor();
    assert.deepEqual(calls[1].context, { id: 'qr1', revision: 'rev1' });
    assert.equal(calls[1].format, 'png');
  } finally { await page.close(); }
});

test('pause and filtering use persisted statuses', async () => {
  const { page, calls } = await open();
  try {
    await page.getByRole('button', { name: 'Sæt på pause Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Aktivér Bord 1', exact: true }).waitFor();
    assert.equal(calls[0].status, 'paused');
    await page.getByLabel('Status', { exact: true }).selectOption('active');
    assert.equal(await page.getByRole('heading', { name: 'Bord 1', exact: true }).count(), 0);
    await page.getByLabel('Status', { exact: true }).selectOption('paused');
    await page.getByLabel('Søg QR-koder', { exact: true }).fill('ikke fundet');
    assert.equal(await page.getByRole('heading', { name: 'Bord 1', exact: true }).count(), 0);
  } finally { await page.close(); }
});
