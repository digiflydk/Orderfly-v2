// Real bulk UI and real pure CSV preview rules, with intercepted transport.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const root = process.cwd();
const sourceFile = path.join(root, 'src/app/superadmin/qr-codes/qr-bulk-tools.tsx');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  new Function('require', 'exports', 'module', compile(fs.readFileSync(file, 'utf8')))(name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name), module.exports, module);
  return module.exports;
}
const { previewQrCsv } = loadTs(path.join(root, 'src/lib/qr/bulk.ts'));
const brands = [{ id: 'b1', name: 'Esmeralda', allowWholeBrand: true, locations: [{ id: 'l1', name: 'Amager' }] }, { id: 'b2', name: 'Andet brand', allowWholeBrand: false, locations: [{ id: 'l2', name: 'Afdeling 2' }] }];
const csv = 'name,destination,brand_id,location_id\nBord 1,https://example.com/menu,b1,l1\n';
function preview(brandId, data) {
  const brand = brands.find(value => value.id === brandId);
  const result = previewQrCsv(data, { allowedScopes: brand ? [{ brandId, locationIds: brand.locations.map(value => value.id), allowBrandWide: brand.allowWholeBrand }] : [] });
  if (result.plan) result.plan.sha256 = createHash('sha256').update(result.plan.canonical).digest('hex');
  return result;
}
function records(plan) {
  return JSON.parse(plan.canonical).entries.map((entry, index) => ({ ...entry, id: `qr${index}`, revision: '1', status: 'active', kind: 'dynamic', staticType: 'url', fields: {}, utm: { source: '', medium: '', campaign: '', content: '', term: '' } }));
}
let server, browser, origin;
before(async () => {
  const component = compile(fs.readFileSync(sourceFile, 'utf8'));
  const reactDir = path.dirname(require.resolve('react/package.json')), domDir = path.dirname(require.resolve('react-dom/package.json'));
  const boot = `
    const jsx={jsx:(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})}),jsxs:(type,props,key)=>React.createElement(type,{...props,...(key===undefined?{}:{key})}),Fragment:React.Fragment};
    const module={exports:{}};new Function('require','exports','module',${JSON.stringify(component)})(name=>name==='react'?React:name==='react/jsx-runtime'?jsx:(()=>{throw Error(name)})(),module.exports,module);
    async function call(action,body){const response=await fetch('/api/qr/bulk-test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body})});const value=await response.json();if(!response.ok)throw value;return value;}
    const api={preview:(brandId,csv)=>call('preview',{brandId,csv}),commit:(brandId,input)=>call('commit',{brandId,...input})};
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.QrBulkTools,{brands:${JSON.stringify(brands)},api,onCommitted:async()=>{if(location.search.includes('refreshfail'))throw Error('PRIVATE_REFRESH_DETAILS');window.__committed=(window.__committed||0)+1}}));`;
  server = http.createServer((req, res) => {
    if (req.url === '/react.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(reactDir, 'umd/react.development.js'))); }
    if (req.url === '/react-dom.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(domDir, 'umd/react-dom.development.js'))); }
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); return res.end(boot); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CART_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open({ answers = [], query = '', width = 390 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } }), calls = [], errors = [];
  page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/qr/bulk-test', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    const answer = answers.shift();
    if (answer === 'abort') return route.abort('internetdisconnected');
    if (typeof answer === 'function') return answer(route, body);
    const result = answer || [200, body.action === 'preview' ? preview(body.brandId, body.csv) : { records: records(body) }];
    return route.fulfill({ status: result[0], contentType: 'application/json', body: JSON.stringify(result[1]) });
  });
  await page.goto(origin + '/' + query); await page.getByRole('heading', { name: 'Importér QR-koder fra CSV', exact: true }).waitFor(); assert.deepEqual(errors, []);
  return { page, calls };
}
async function inspect(page, data = csv) {
  await page.getByLabel('CSV-data', { exact: true }).fill(data); await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click();
}
async function confirm(page) {
  const checkbox = page.getByRole('checkbox', { name: 'Jeg vil oprette 1 dynamiske QR-koder for Esmeralda.', exact: true }); await checkbox.waitFor(); await checkbox.check();
}

for (const width of [390, 1440]) test(`preview requires explicit confirmation and preserves canonical digest at ${width}px`, async () => {
  const { page, calls } = await open({ width });
  try {
    assert.equal(await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).isDisabled(), true);
    await inspect(page); const create = page.getByRole('button', { name: 'Opret 1 QR-koder', exact: true }); await create.waitFor(); assert.equal(await create.isDisabled(), true);
    await confirm(page); await create.click(); await page.getByRole('status').filter({ hasText: '1 QR-koder er oprettet.' }).waitFor();
    assert.equal(calls.length, 2); assert.equal(calls[1].brandId, 'b1');
    const expected = preview('b1', csv).plan; assert.equal(calls[1].canonical, expected.canonical); assert.equal(calls[1].sha256, expected.sha256); assert.match(calls[1].requestId, /^[a-f0-9-]{36}$/);
    assert.equal(await page.getByLabel('CSV-data', { exact: true }).inputValue(), '');
  } finally { await page.close(); }
});

test('any row error or foreign selected scope blocks the whole import', async () => {
  const { page, calls } = await open();
  try {
    await inspect(page, csv + 'Bord 2,javascript:alert(1),b2,l2\n');
    await page.getByRole('heading', { name: 'Ret fejlene før import', exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 0); assert.equal(await page.getByRole('button', { name: /^Opret / }).count(), 0); assert.equal(calls.length, 1);
  } finally { await page.close(); }
});

test('changing CSV or brand invalidates a prior confirmed plan', async () => {
  const { page, calls } = await open();
  try {
    await inspect(page); await confirm(page);
    await page.getByLabel('CSV-data', { exact: true }).fill(csv.replace('Bord 1', 'Bord 2'));
    assert.equal(await page.getByRole('checkbox').count(), 0);
    await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click(); await confirm(page);
    await page.getByRole('combobox', { name: 'Brand til CSV-import', exact: true }).selectOption('b2');
    assert.equal(await page.getByRole('checkbox').count(), 0); assert.equal(calls.length, 2);
  } finally { await page.close(); }
});

test('unknown commit and later denial keep original request locked until receipt success', async () => {
  const { page, calls } = await open({ answers: [[200, preview('b1', csv)], 'abort', [403, { code: 'forbidden', message: 'PRIVATE_DETAILS' }]] });
  try {
    await inspect(page); await confirm(page); await page.getByRole('button', { name: 'Opret 1 QR-koder', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Prøv samme import igen', exact: true }); await retry.waitFor();
    assert.equal(await page.getByLabel('CSV-data', { exact: true }).isDisabled(), true); await retry.click();
    await page.getByRole('alert').filter({ hasText: 'Importens resultat er usikkert.' }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Brand til CSV-import', exact: true }).isDisabled(), true);
    assert.equal(await page.getByText('PRIVATE_DETAILS', { exact: true }).count(), 0);
    await retry.click(); await page.getByRole('status').filter({ hasText: '1 QR-koder er oprettet.' }).waitFor();
    assert.equal(calls.length, 4); assert.deepEqual(calls[1], calls[2]); assert.deepEqual(calls[1], calls[3]);
  } finally { await page.close(); }
});

test('double click produces one commit and refresh callback failure does not replay the write', async () => {
  const { page, calls } = await open({ query: '?refreshfail' });
  try {
    await inspect(page); await confirm(page);
    await page.getByRole('button', { name: 'Opret 1 QR-koder', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('alert').filter({ hasText: 'Koderne er oprettet, men oversigten' }).waitFor();
    assert.equal(calls.filter(call => call.action === 'commit').length, 1); assert.equal(await page.getByRole('button', { name: 'Prøv samme import igen' }).count(), 0);
  } finally { await page.close(); }
});

test('empty, oversized and malformed UTF-8 files never reach the API', async () => {
  const { page, calls } = await open();
  try {
    assert.equal(await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).isDisabled(), true);
    await page.getByLabel('CSV-data', { exact: true }).fill('x'.repeat(128 * 1024 + 1));
    await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'CSV-data må højst' }).waitFor();
    await page.getByLabel('CSV-data', { exact: true }).fill(csv);
    await page.getByLabel('CSV-fil', { exact: true }).setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from([0xff, 0xfe]) });
    await page.getByRole('alert').filter({ hasText: 'Filen skal være gyldig UTF-8' }).waitFor();
    assert.equal(await page.getByLabel('CSV-data', { exact: true }).inputValue(), csv); assert.equal(calls.length, 0);
  } finally { await page.close(); }
});

test('tampered hash or foreign-brand canonical preview cannot be confirmed', async () => {
  const tampered = preview('b1', csv); tampered.plan.sha256 = '0'.repeat(64);
  const foreign = preview('b2', csv.replace('b1,l1', 'b2,l2'));
  const { page, calls } = await open({ answers: [[200, tampered], [200, foreign]] });
  try {
    await inspect(page); await page.getByRole('alert').filter({ hasText: 'CSV-preview kunne ikke valideres.' }).waitFor(); assert.equal(await page.getByRole('checkbox').count(), 0);
    await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'CSV-preview kunne ikke valideres.' }).waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 0); assert.equal(calls.length, 2);
  } finally { await page.close(); }
});

test('valid UTF-8 file loads for preview and a first definitive denial permits correction', async () => {
  const { page, calls } = await open({ answers: [[200, preview('b1', csv)], [403, { code: 'forbidden' }]] });
  try {
    await page.getByLabel('CSV-fil', { exact: true }).setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CSV-data"]').value.length > 0);
    await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click(); await confirm(page);
    await page.getByRole('button', { name: 'Opret 1 QR-koder', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'Du har ikke adgang til importen.' }).waitFor();
    assert.equal(await page.getByLabel('CSV-data', { exact: true }).isDisabled(), false);
    assert.equal(await page.getByRole('button', { name: 'Prøv samme import igen' }).count(), 0);
    await page.getByLabel('CSV-data', { exact: true }).fill(csv.replace('Bord 1', 'Bord 2')); assert.equal(calls.length, 2);
  } finally { await page.close(); }
});

test('more than 100 rows is rejected and template uses the selected permitted location', async () => {
  const { page } = await open();
  try {
    const many = 'name,destination,brand_id,location_id\n' + Array.from({ length: 101 }, (_, index) => `Bord ${index},https://example.com/${index},b1,l1`).join('\n');
    await inspect(page, many); await page.getByRole('heading', { name: 'Ret fejlene før import', exact: true }).waitFor(); assert.equal(await page.getByRole('checkbox').count(), 0);
    await page.getByRole('combobox', { name: 'Brand til CSV-import', exact: true }).selectOption('b2');
    await page.getByText('CSV-skabelon', { exact: true }).click(); await page.getByRole('button', { name: 'Brug skabelon', exact: true }).click();
    assert.match(await page.getByLabel('CSV-data', { exact: true }).inputValue(), /,b2,l2,/);
  } finally { await page.close(); }
});
