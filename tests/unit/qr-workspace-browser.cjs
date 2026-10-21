// Actual page/workspace/manager/dashboard. The API is intercepted; this does
// not prove production authorization or live-data correctness.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const root = process.cwd();
const componentDir = path.join(root, 'src/app/superadmin/qr-codes');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const base = { name: 'Bord 1', brandId: 'b1', locationId: 'l1', kind: 'dynamic', destination: 'https://example.com/menu', staticType: 'url', fields: {}, campaign: 'Oktober', tags: [], utm: { source: '', medium: 'qr', campaign: '', content: '', term: '' }, id: 'qr1', revision: '1', status: 'active' };
const initial = { brands: [{ id: 'b1', name: 'Esmeralda', locations: [{ id: 'l1', name: 'Amager' }] }], codes: [base], capabilities: { create: true, edit: true, archive: true, export: true }, analytics: true, truncated: false };
const metrics = { from: Date.parse('2026-10-20T22:00:00Z'), to: Date.parse('2026-10-21T22:00:00Z'), timezone: 'Europe/Copenhagen', totalOpenings: 4, probableScans: 3, excludedOpenings: 1, knownUnique: 0, unidentifiedScans: 3, estimatedUnique: null, byDay: [], byHour: [], byQr: [], byDevice: [], byOs: [], byBrowser: [], byReferrer: [] };
let server, browser, origin;

before(async () => {
  const modules = ['qr-manager', 'qr-analytics', 'qr-workspace'].map(name => [name, transpile(fs.readFileSync(path.join(componentDir, name + '.tsx'), 'utf8'))]);
  const reactDir = path.dirname(require.resolve('react/package.json')), domDir = path.dirname(require.resolve('react-dom/package.json'));
  const script = `
    window.__urls=[];window.__revoked=[];
    const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=originalCreate(blob);window.__urls.push({url,type:blob.type});return url};
    URL.revokeObjectURL=url=>{window.__revoked.push(url);originalRevoke(url)};
    const modules={},jsx={jsx:(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})}),jsxs:(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})}),Fragment:React.Fragment};
    function require(name){if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name.startsWith('./'))return modules[name.slice(2)];throw Error(name)}
    for(const [name,source] of ${JSON.stringify(modules)}){const module={exports:{}};new Function('require','exports','module',source)(require,module.exports,module);modules[name]=module.exports;}
    const props=${JSON.stringify(initial)},params=new URLSearchParams(location.search);
    if(params.has('denied')){props.analytics=false;props.capabilities={create:false,edit:false,archive:false,export:false};}
    if(params.has('truncated'))props.truncated=true;
    const app=ReactDOM.createRoot(document.getElementById('root'));
    window.__unmount=()=>app.unmount();app.render(React.createElement(modules['qr-workspace'].QrWorkspace,{initial:props}));`;
  server = http.createServer((req, res) => {
    if (req.url === '/react.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(reactDir, 'umd/react.development.js'))); }
    if (req.url === '/react-dom.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(domDir, 'umd/react-dom.development.js'))); }
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); return res.end(script); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CART_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open({ answers = [], query = '', width = 390 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } }), calls = [], errors = [];
  page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/qr/admin', async route => {
    const request = route.request(), body = request.postDataJSON(); calls.push({ body, method: request.method(), headers: request.headers() });
    const answer = answers.shift();
    if (answer === 'abort') return route.abort('internetdisconnected');
    if (typeof answer === 'function') return answer(route, body);
    const result = answer || [200, body.action === 'list' ? initial : body.action === 'analytics' ? { metrics, complete: true } : base];
    return route.fulfill({ status: result[0], contentType: result[2] || 'application/json', body: typeof result[1] === 'string' ? result[1] : JSON.stringify(result[1]) });
  });
  await page.goto(origin + '/' + query); await page.getByRole('heading', { name: 'QR-koder', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  return { page, calls };
}

for (const width of [390, 1440]) test(`SSR initial state makes no request; saved mutation refreshes actual catalogue at ${width}px`, async () => {
  const saved = { ...base, name: 'Nyt navn', revision: '2' };
  const { page, calls } = await open({ width, answers: [[200, saved], [200, { ...initial, codes: [saved] }]] });
  try {
    assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Nyt navn');
    await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('heading', { name: 'Nyt navn', exact: true }).waitFor();
    assert.equal(calls.length, 2); assert.equal(calls[0].body.action, 'save'); assert.deepEqual(calls[1].body, { action: 'list' });
    assert.equal(calls[0].body.context.revision, '1'); assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].headers['content-type'], 'application/json');
    assert.equal(calls[0].headers.origin, origin);
  } finally { await page.close(); }
});

test('confirmed write remains successful if directory refresh fails', async () => {
  const saved = { ...base, name: 'Bekræftet', revision: '2' };
  const { page, calls } = await open({ answers: [[200, saved], [503, { error: 'unavailable' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Bekræftet'); await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('heading', { name: 'Bekræftet', exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Ændringen er gemt' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Prøv samme handling igen' }).count(), 0); assert.equal(calls.length, 2);
  } finally { await page.close(); }
});

test('HTTP permission error is normalized without exposing provider text', async () => {
  const { page, calls } = await open({ answers: [[403, { error: 'forbidden', providerMessage: 'PRIVATE_INTERNAL_TEXT' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Navn', { exact: true }).fill('Bevar'); await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByLabel('Navn', { exact: true }).inputValue(), 'Bevar');
    assert.equal(await page.getByRole('button', { name: 'Annullér', exact: true }).isDisabled(), false);
    assert.equal(await page.getByText('PRIVATE_INTERNAL_TEXT').count(), 0); assert.equal(calls.length, 1);
  } finally { await page.close(); }
});

test('uncertain write cannot be bypassed by changing workspace tab and retry is identical', async () => {
  const { page, calls } = await open({ answers: ['abort', [200, { ...base, revision: '2' }], [200, initial]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click(); await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); await page.getByRole('button', { name: 'Administration', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Annullér', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).click();
    await page.getByRole('form', { name: 'Redigér QR-kode', exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(calls[0].body, calls[1].body); assert.equal(calls[2].body.action, 'list');
  } finally { await page.close(); }
});

test('status command takes brand and location from the stored code', async () => {
  const paused = { ...base, status: 'paused', revision: '2' };
  const { page, calls } = await open({ answers: [[200, paused], [200, { ...initial, codes: [paused] }]] });
  try {
    await page.getByRole('button', { name: 'Sæt på pause Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Aktivér Bord 1', exact: true }).waitFor();
    const { requestId, ...body } = calls[0].body;
    assert.deepEqual(body, { action: 'status', id: 'qr1', brandId: 'b1', locationId: 'l1', status: 'paused', revision: '1' }); assert.match(requestId, /^[a-f0-9-]{36}$/);
  } finally { await page.close(); }
});

test('malformed successful save is uncertain and preserves the same write request for retry', async () => {
  const { page, calls } = await open({ answers: [[200, {}], [200, { ...base, revision: '2' }], [200, initial]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByRole('button', { name: 'Gem QR-kode', exact: true }).click();
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Navn', { exact: true }).inputValue(), 'Bord 1');
    await page.getByRole('button', { name: 'Prøv samme handling igen', exact: true }).click();
    await page.getByRole('form', { name: 'Redigér QR-kode', exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(calls[0].body, calls[1].body);
  } finally { await page.close(); }
});

test('PNG response becomes local download, then object URL is revoked on unmount', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cCuoAAAAASUVORK5CYII=';
  const { page, calls } = await open({ answers: [[200, { content: png, mime: 'image/png', encoding: 'base64', filename: 'test-qr.png' }]] });
  try {
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    assert.equal((await download).suggestedFilename(), 'test-qr.png');
    assert.deepEqual(calls[0].body.context, { id: 'qr1', revision: '1' }); assert.equal(calls[0].body.format, 'png');
    const urls = await page.evaluate(() => window.__urls); assert.equal(urls.length, 1); assert.equal(urls[0].type, 'image/png');
    await page.evaluate(() => window.__unmount()); assert.deepEqual(await page.evaluate(() => window.__revoked), [urls[0].url]);
  } finally { await page.close(); }
});

test('analytics requires a concrete code and sends exact scoped date filter', async () => {
  const { page, calls } = await open();
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click();
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Vælg en bestemt QR-kode' }).waitFor(); assert.equal(calls.length, 0);
    await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('qr1');
    await page.getByLabel('Fra dato', { exact: true }).fill('2026-10-21'); await page.getByLabel('Til og med dato', { exact: true }).fill('2026-10-21');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click();
    await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    assert.deepEqual(calls[0].body, { action: 'analytics', brandId: 'b1', locationId: 'l1', id: 'qr1', from: '2026-10-21', to: '2026-10-21' });
  } finally { await page.close(); }
});

test('analytics export uses same scoped filter and is hidden without permission', async () => {
  const { page, calls } = await open({ answers: [[200, { metrics, complete: true }], [200, { csv: 'date,scans\r\n2026-10-21,3\r\n' }]] });
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('qr1');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click(); await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Eksportér CSV', exact: true }).click(); await download;
    assert.deepEqual(calls[1].body, { ...calls[0].body, export: true });
  } finally { await page.close(); }
  const denied = await open({ query: '?denied' });
  try { assert.equal(await denied.page.getByRole('button', { name: 'Statistik', exact: true }).count(), 0); assert.equal(denied.calls.length, 0); } finally { await denied.page.close(); }
});

test('server page guards unauthorized, forbidden and unavailable before rendering data', async () => {
  class AuthorityError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
  const Workspace = () => null, Denied = () => null;
  const pageSource = transpile(fs.readFileSync(path.join(componentDir, 'page.tsx'), 'utf8'));
  async function render(load) {
    const module = { exports: {} };
    const mockRequire = name => name === 'next/navigation' ? { redirect: url => { throw new Error('REDIRECT:' + url); } }
      : name === '@/lib/access/authority' ? { AuthorityError }
      : name === '@/lib/qr/runtime' ? { loadQrWorkspace: load }
      : name === '@/components/superadmin/access-denied-page' ? { AccessDeniedPage: Denied }
      : name === './qr-workspace' ? { QrWorkspace: Workspace } : require(name);
    new Function('require', 'exports', 'module', pageSource)(mockRequire, module.exports, module);
    return module.exports.default();
  }
  const ok = await render(async () => initial); assert.equal(ok.type, Workspace); assert.equal(ok.props.initial, initial);
  await assert.rejects(render(async () => { throw new AuthorityError('unauthorized', 401); }), /REDIRECT:\/admin-login/);
  assert.equal((await render(async () => { throw new AuthorityError('forbidden', 403); })).type, Denied);
  const unavailable = await render(async () => { throw new AuthorityError('PRIVATE_PROVIDER_DETAIL', 503); });
  assert.equal(unavailable.props.role, 'alert'); assert.equal(JSON.stringify(unavailable).includes('PRIVATE_PROVIDER_DETAIL'), false);
});
