// Actual page/workspace/manager/dashboard. The API is intercepted; this does
// not prove production authorization or live-data correctness.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const { chromium } = require('@playwright/test');
const root = process.cwd();
const componentDir = path.join(root, 'src/app/superadmin/qr-codes');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const base = { name: 'Bord 1', brandId: 'b1', locationId: 'l1', kind: 'dynamic', destination: 'https://example.com/menu', staticType: 'url', fields: {}, campaign: 'Oktober', tags: [], utm: { source: '', medium: 'qr', campaign: '', content: '', term: '' }, id: 'qr1', revision: '1', status: 'active' };
const initial = { brands: [{ id: 'b1', name: 'Esmeralda', locations: [{ id: 'l1', name: 'Amager' }] }], codes: [base], capabilities: { create: true, edit: true, archive: true, export: true }, analytics: true, truncated: false, dynamicEnabled: true };
const metrics = { from: Date.parse('2026-10-20T22:00:00Z'), to: Date.parse('2026-10-21T22:00:00Z'), timezone: 'Europe/Copenhagen', totalOpenings: 4, probableScans: 3, excludedOpenings: 1, knownUnique: 0, unidentifiedScans: 3, estimatedUnique: null, byDay: [], byHour: [], byQr: [], byDevice: [], byOs: [], byBrowser: [], byReferrer: [] };
const bulkEntry = { name: 'CSV bord', destination: 'https://example.com/csv', brandId: 'b1', locationId: 'l1', campaign: '', tags: [] };
const canonical = JSON.stringify({ schemaVersion: 1, entries: [bulkEntry] });
const bulkPlan = { schemaVersion: 1, entries: [bulkEntry], canonical, sha256: createHash('sha256').update(canonical).digest('hex') };
const bulkPreview = { ok: true, rows: [{ row: 2, entry: bulkEntry }], errors: [], plan: bulkPlan };
const bulkRecord = { ...base, ...bulkEntry, id: 'csv-qr' };
let server, browser, origin;

before(async () => {
  const modules = ['qr-manager', 'qr-analytics', 'qr-bulk-tools', 'qr-print-tools', 'qr-lifetime-summary', 'qr-history', 'qr-workspace'].map(name => [name, transpile(fs.readFileSync(path.join(componentDir, name + '.tsx'), 'utf8'))]);
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
    if(params.has('off'))props.dynamicEnabled=false;
    if(params.has('missingflag'))delete props.dynamicEnabled;
    if(params.has('exportonly'))props.capabilities={create:false,edit:false,archive:false,export:true};
    if(params.has('collision')){props.brands.push({id:'b2',name:'Andet brand',locations:[{id:'l2',name:'Anden afdeling'}]});props.codes.push({...props.codes[0],brandId:'b2',locationId:'l2',name:'Anden kode'});}
    if(params.has('lifetime')){props.codes.push({...props.codes[0],id:'legacy',name:'Gammel kode'},{...props.codes[0],id:'hidden',name:'Ingen totaladgang'},{...props.codes[0],id:'zero',name:'Ny tom kode'});props.allTime={'b1/qr1':{openings:9,probableScans:7,excludedOpenings:2,firstOpenedAt:1792533600000,lastOpenedAt:1792619999000},'b2/qr1':{openings:20,probableScans:18,excludedOpenings:2,firstOpenedAt:1792533600000,lastOpenedAt:1792619999000},'b1/legacy':null,'b1/zero':{openings:0,probableScans:0,excludedOpenings:0,firstOpenedAt:null,lastOpenedAt:null}};}
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
    const result = answer || [200, body.action === 'list' ? initial : body.action === 'analytics' ? { metrics, complete: true, currentLocationOnly: false } : base];
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

test('history uses the selected brand and current location and handles denied or malformed responses', async () => {
  const row={id:'audit1',at:1792533600000,action:'update',actorId:'employee1',revision:2,previousRevision:1,changes:[{field:'name',before:'Tidligere',after:'Historisk navn'}]};
  const {page,calls}=await open({query:'?collision',answers:[[403,{error:'forbidden'}],[200,{rows:'bad',truncated:false,discarded:0}],[200,{rows:[row],truncated:false,discarded:0}]]});
  try{
    await page.getByRole('button',{name:'Historik',exact:true}).click();assert.equal(calls.length,0);
    await page.getByLabel('QR-kode til historik',{exact:true}).selectOption('b2/qr1');
    await page.getByRole('alert').filter({hasText:'Historikken kunne ikke hentes'}).waitFor();
    assert.deepEqual(calls[0].body,{action:'history',brandId:'b2',locationId:'l2',id:'qr1'});
    await page.getByRole('button',{name:'Genindlæs historik',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Historikken kunne ikke hentes'}).waitFor();
    await page.getByRole('button',{name:'Genindlæs historik',exact:true}).click();
    await page.getByText('Efter: Historisk navn',{exact:false}).waitFor();assert.equal(calls.length,3);
  }finally{await page.close();}
});

test('workspace displays historical scan groups from the report rather than catalogue campaign',async()=>{
  const attribution={byCampaign:[{key:'Forrige kampagne',openings:4,probableScans:3,excludedOpenings:1}],byLocation:[{key:'retired',openings:4,probableScans:3,excludedOpenings:1}]};
  const {page}=await open({answers:[[200,{metrics,complete:true,currentLocationOnly:false,attribution}]]});
  try{
    await page.getByRole('button',{name:'Statistik',exact:true}).click();
    await page.getByRole('combobox',{name:'QR-kode',exact:true}).selectOption('b1/qr1');
    await page.getByRole('button',{name:'Vis statistik',exact:true}).click();
    await page.getByText('Forrige kampagne',{exact:true}).waitFor();
    await page.getByText('Afdeling retired',{exact:true}).waitFor();
  }finally{await page.close();}
});

test('analytics requires a concrete code and sends exact scoped date filter', async () => {
  const { page, calls } = await open();
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click();
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Vælg en bestemt QR-kode' }).waitFor(); assert.equal(calls.length, 0);
    await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('b1/qr1');
    await page.getByLabel('Fra dato', { exact: true }).fill('2026-10-21'); await page.getByLabel('Til og med dato', { exact: true }).fill('2026-10-21');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click();
    await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    assert.deepEqual(calls[0].body, { action: 'analytics', brandId: 'b1', locationId: 'l1', id: 'qr1', from: '2026-10-21', to: '2026-10-21' });
  } finally { await page.close(); }
});

test('analytics export uses same scoped filter and is hidden without permission', async () => {
  const { page, calls } = await open({ answers: [[200, { metrics, complete: true, currentLocationOnly: false }], [200, { csv: 'date,scans\r\n2026-10-21,3\r\n' }]] });
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('b1/qr1');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click(); await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Eksportér CSV', exact: true }).click(); await download;
    assert.deepEqual(calls[1].body, { ...calls[0].body, export: true });
  } finally { await page.close(); }
  const denied = await open({ query: '?denied' });
  try { assert.equal(await denied.page.getByRole('button', { name: 'Statistik', exact: true }).count(), 0); assert.equal(denied.calls.length, 0); } finally { await denied.page.close(); }
});

test('disabled dynamic runtime cannot save or print dynamic codes, while static generator works', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cCuoAAAAASUVORK5CYII=';
  const { page, calls } = await open({ query: '?off', answers: [[200, { imageUrl: 'data:image/png;base64,' + png, payload: 'hello' }]] });
  try {
    await page.getByRole('status').filter({ hasText: 'Dynamiske QR-koder er ikke aktiveret.' }).waitFor();
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    for (const name of ['Gem QR-kode', 'Vis eksempel', 'Download PNG', 'Download SVG']) assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true);
    assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Annullér', exact: true }).click();
    await page.getByRole('button', { name: 'Generér statisk QR-kode', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: 'Kodetype', exact: true }).inputValue(), 'static');
    assert.equal(await page.getByRole('combobox', { name: 'Kodetype', exact: true }).getByRole('option', { name: 'Dynamisk, med statistik', exact: true }).evaluate(option => option.disabled), true);
    await page.getByRole('combobox', { name: 'Kodetype', exact: true }).focus(); await page.keyboard.press('Home');
    assert.equal(await page.getByRole('combobox', { name: 'Kodetype', exact: true }).inputValue(), 'static');
    await page.getByRole('combobox', { name: 'Indholdstype', exact: true }).selectOption('text');
    await page.getByLabel('Tekst', { exact: true }).fill('hello'); await page.getByRole('button', { name: 'Vis eksempel', exact: true }).click();
    await page.getByRole('img', { name: 'Eksempel på QR-kode', exact: true }).waitFor();
    assert.equal(calls.length, 1); assert.equal(calls[0].body.action, 'render'); assert.equal(calls[0].body.draft.kind, 'static'); assert.deepEqual(calls[0].body.context, {});
    assert.equal(await page.getByRole('button', { name: 'Statistik', exact: true }).count(), 1);
  } finally { await page.close(); }
});

test('missing runtime flag is disabled in the real workspace', async () => {
  const { page, calls } = await open({ query: '?missingflag' });
  try {
    assert.equal(await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Generér statisk QR-kode', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Duplikér Bord 1', exact: true }).count(), 0); assert.equal(calls.length, 0);
  } finally { await page.close(); }
});

test('real bulk adapter sends preview, stable commit and catalogue refresh without unmounting on tab switch', async () => {
  const { page, calls } = await open({ answers: [[200, bulkPreview], 'abort', [200, { records: [bulkRecord] }], [200, { ...initial, codes: [base, bulkRecord] }]] });
  try {
    await page.getByRole('button', { name: 'CSV-import', exact: true }).click();
    const csv = 'name,destination,brand_id,location_id\nCSV bord,https://example.com/csv,b1,l1\n';
    await page.getByLabel('CSV-data', { exact: true }).fill(csv); await page.getByRole('button', { name: 'Kontrollér CSV', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Jeg vil oprette 1 dynamiske QR-koder for Esmeralda.', exact: true }).check();
    await page.getByRole('button', { name: 'Opret 1 QR-koder', exact: true }).click(); await page.getByRole('button', { name: 'Prøv samme import igen', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Administration', exact: true }).click(); await page.getByRole('button', { name: 'CSV-import', exact: true }).click();
    assert.equal(await page.getByLabel('CSV-data', { exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Prøv samme import igen', exact: true }).click(); await page.getByRole('status').filter({ hasText: '1 QR-koder er oprettet.' }).waitFor();
    assert.deepEqual(calls[0].body, { action: 'bulk_preview', brandId: 'b1', csv });
    assert.deepEqual(calls[1].body, calls[2].body); assert.equal(calls[1].body.action, 'bulk_commit'); assert.equal(calls[1].body.canonical, canonical); assert.equal(calls[1].body.sha256, bulkPlan.sha256);
    assert.deepEqual(calls[3].body, { action: 'list' });
    await page.getByRole('button', { name: 'Administration', exact: true }).click(); await page.getByRole('heading', { name: 'CSV bord', exact: true }).waitFor();
  } finally { await page.close(); }
});

test('bulk creation is unavailable while disabled or without create capability', async () => {
  for (const query of ['?off', '?exportonly']) {
    const { page, calls } = await open({ query });
    try { assert.equal(await page.getByRole('button', { name: 'CSV-import', exact: true }).count(), 0); assert.equal(calls.length, 0); }
    finally { await page.close(); }
  }
});

test('print extras require saved unchanged dynamic state and send logo to the real render command', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cCuoAAAAASUVORK5CYII=';
  const { page, calls } = await open({ answers: [[200, { content: png, mime: 'image/png', encoding: 'base64', filename: 'logo-qr.png' }]] });
  try {
    await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).click(); assert.equal(await page.getByRole('heading', { name: 'Logo og print', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Annullér', exact: true }).click(); await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByRole('heading', { name: 'Logo og print', exact: true }).waitFor();
    await page.getByLabel('Navn', { exact: true }).fill('Usaved'); assert.equal(await page.getByRole('heading', { name: 'Logo og print', exact: true }).count(), 0);
    await page.getByLabel('Navn', { exact: true }).fill('Bord 1'); await page.getByRole('heading', { name: 'Logo og print', exact: true }).waitFor();
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByText('Valgt logo: logo.png', { exact: true }).waitFor(); const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG med valgt logo', exact: true }).click(); assert.equal((await download).suggestedFilename(), 'logo-qr.png');
    assert.equal(calls.length, 1); assert.equal(calls[0].body.action, 'render'); assert.equal(calls[0].body.format, 'png'); assert.equal(calls[0].body.logoBase64, png); assert.equal(calls[0].body.draft.style.errorCorrectionLevel, 'H');
    assert.deepEqual(calls[0].body.context, { id: 'qr1', revision: '1' });
  } finally { await page.close(); }
});

test('static print works with dynamic runtime off and export-only permission', async () => {
  const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'"></head><body><h1>Statisk print</h1></body></html>';
  const { page, calls } = await open({ query: '?off&exportonly', answers: [[200, { content: html, mime: 'text/html', filename: 'qr-print.html' }]] }); let popup;
  try {
    await page.getByRole('button', { name: 'Generér statisk QR-kode', exact: true }).click();
    await page.getByRole('combobox', { name: 'Indholdstype', exact: true }).selectOption('text'); await page.getByLabel('Tekst', { exact: true }).fill('hej');
    const opened = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Åbn print / Gem som PDF', exact: true }).click(); popup = await opened;
    await popup.getByRole('heading', { name: 'Statisk print', exact: true }).waitFor(); assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(calls.length, 1); assert.equal(calls[0].body.format, 'print'); assert.equal(calls[0].body.draft.kind, 'static'); assert.deepEqual(calls[0].body.context, {});
  } finally { await popup?.close(); await page.close(); }
});

test('lifetime counts use explicit composite keys, distinguish legacy unknown and zero, and omit missing scope', async () => {
  const { page } = await open({ query: '?collision&lifetime' });
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); const table = page.getByRole('table', { name: 'Samlede scanninger pr. QR-kode', exact: true }); await table.waitFor();
    const row = name => table.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
    assert.deepEqual((await row('Bord 1').getByRole('cell').allTextContents()).slice(0, 4), ['Esmeralda', '9', '7', '2']);
    assert.deepEqual((await row('Anden kode').getByRole('cell').allTextContents()).slice(0, 4), ['Andet brand', '20', '18', '2']);
    assert.equal((await row('Gammel kode').getByRole('cell').allTextContents()).filter(value => value === 'Ukendt').length, 5);
    assert.deepEqual(await row('Ny tom kode').getByRole('cell').allTextContents(), ['Esmeralda', '0', '0', '0', '—', '—']);
    assert.equal(await table.getByRole('rowheader', { name: 'Ingen totaladgang', exact: true }).count(), 0);
  } finally { await page.close(); }
});

test('same code ID in two brands uses the selected row scope for mutation and analytics', async () => {
  const other = { ...base, brandId: 'b2', locationId: 'l2', name: 'Anden kode', status: 'paused', revision: '2' };
  const snapshot = { ...initial, brands: [...initial.brands, { id: 'b2', name: 'Andet brand', locations: [{ id: 'l2', name: 'Anden afdeling' }] }], codes: [base, other] };
  const { page, calls } = await open({ query: '?collision', answers: [[200, other], [200, snapshot], [200, { metrics, complete: true, currentLocationOnly: true }]] });
  try {
    await page.getByRole('button', { name: 'Sæt på pause Anden kode', exact: true }).click(); await page.getByRole('button', { name: 'Aktivér Anden kode', exact: true }).waitFor();
    assert.equal(calls[0].body.brandId, 'b2'); assert.equal(calls[0].body.locationId, 'l2'); assert.equal(await page.getByRole('heading', { name: 'Bord 1', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('b2/qr1');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click(); await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    assert.equal(calls[2].body.brandId, 'b2'); assert.equal(calls[2].body.id, 'qr1');
    await page.getByRole('note', { name: 'Afdelingshistorik', exact: true }).filter({ hasText: 'Kun hændelser fra QR-kodens nuværende afdeling' }).waitFor();
  } finally { await page.close(); }
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
