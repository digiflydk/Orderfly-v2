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
const initial = { brands: [{ id: 'b1', name: 'Esmeralda', locations: [{ id: 'l1', name: 'Amager' }] }], codes: [base], capabilities: { create: true, edit: true, archive: true, export: true }, analytics: true, analyticsCodeKeys: ['b1/qr1','b2/qr1','b1/legacy','b1/zero'], truncated: false, dynamicEnabled: true };
const metrics = { from: Date.parse('2026-10-20T22:00:00Z'), to: Date.parse('2026-10-21T22:00:00Z'), timezone: 'Europe/Copenhagen', totalOpenings: 4, probableScans: 3, excludedOpenings: 1, knownUnique: 0, unidentifiedScans: 3, estimatedUnique: null, byDay: [], byHour: [], byQr: [], byDevice: [], byOs: [], byBrowser: [], byReferrer: [] };
const bulkEntry = { name: 'CSV bord', destination: 'https://example.com/csv', brandId: 'b1', locationId: 'l1', campaign: '', tags: [] };
const canonical = JSON.stringify({ schemaVersion: 1, entries: [bulkEntry] });
const bulkPlan = { schemaVersion: 1, entries: [bulkEntry], canonical, sha256: createHash('sha256').update(canonical).digest('hex') };
const bulkPreview = { ok: true, rows: [{ row: 2, entry: bulkEntry }], errors: [], plan: bulkPlan };
const bulkRecord = { ...base, ...bulkEntry, id: 'csv-qr' };
let server, browser, origin, stylesheet;
const cssDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'qr-workspace-css-'));

before(async () => {
  const cssFile=path.join(cssDir,'app.css');
  require('node:child_process').execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli'),'-i','src/app/globals.css','-o',cssFile,'--minify'],{stdio:'pipe'});
  stylesheet=fs.readFileSync(cssFile,'utf8');
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
    if(params.has('design')){props.codes[0].publicUrl='https://orderfly.dk/q/'+'a'.repeat(32);props.codes[0].name='Pepperoni';props.codes[0].campaign='Frozen pizza';props.codes[0].destination='https://www.esmeraldapizza.dk/produkter';props.allTime={'b1/qr1':{openings:19,probableScans:18,excludedOpenings:1,firstOpenedAt:1792533600000,lastOpenedAt:1792619999000}};}
    if(params.has('pages'))props.codes=Array.from({length:13},(_,i)=>({...props.codes[0],id:'q'+i,name:'Kode '+String(i).padStart(2,'0')}));
    if(params.has('mixedanalytics'))props.analyticsCodeKeys=['b1/qr1'];
    if(params.has('denied')){props.analytics=false;props.capabilities={create:false,edit:false,archive:false,export:false};}
    if(params.has('truncated'))props.truncated=true;
    if(params.has('off'))props.dynamicEnabled=false;
    if(params.has('missingflag'))delete props.dynamicEnabled;
    if(params.has('editonly'))props.capabilities={create:true,edit:true,archive:false,export:false};
    if(params.has('exportonly'))props.capabilities={create:false,edit:false,archive:false,export:true};
    if(params.has('collision')){props.brands.push({id:'b2',name:'Andet brand',locations:[{id:'l2',name:'Anden afdeling'}]});props.codes.push({...props.codes[0],brandId:'b2',locationId:'l2',name:'Anden kode'});}
    if(params.has('lifetime')){props.codes.push({...props.codes[0],id:'legacy',name:'Gammel kode'},{...props.codes[0],id:'hidden',name:'Ingen totaladgang'},{...props.codes[0],id:'zero',name:'Ny tom kode'});props.allTime={'b1/qr1':{openings:9,probableScans:7,excludedOpenings:2,firstOpenedAt:1792533600000,lastOpenedAt:1792619999000},'b2/qr1':{openings:20,probableScans:18,excludedOpenings:2,firstOpenedAt:1792533600000,lastOpenedAt:1792619999000},'b1/legacy':null,'b1/zero':{openings:0,probableScans:0,excludedOpenings:0,firstOpenedAt:null,lastOpenedAt:null}};}
    const app=ReactDOM.createRoot(document.getElementById('root'));
    window.__unmount=()=>app.unmount();app.render(React.createElement(modules['qr-workspace'].QrWorkspace,{initial:props}));`;
  server = http.createServer((req, res) => {
    if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(stylesheet);}
    if (req.url === '/react.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(reactDir, 'umd/react.development.js'))); }
    if (req.url === '/react-dom.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(domDir, 'umd/react-dom.development.js'))); }
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); return res.end(script); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><link rel="stylesheet" href="/styles.css"><style>body{background:#f6f8fb;padding:24px;font-family:Arial,sans-serif}main{max-width:1280px;margin:auto}@media(max-width:600px){body{padding:12px}}</style><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main><script src="/react.js"></script><script src="/react-dom.js"></script><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CART_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { fs.rmSync(cssDir,{recursive:true,force:true});await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

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
    await page.getByLabel('Flere handlinger for Bord 1', { exact: true }).click();
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

test('provisional analytics metadata reaches the UI and export uses the same scoped filter', async () => {
  const { page, calls } = await open({ answers: [[200, { metrics, complete: true, currentLocationOnly: false, futureLimited: true, dataAsOf: Date.parse('2026-10-21T12:00:00Z') }], [200, { csv: 'date,scans\r\n2026-10-21,3\r\n' }]] });
  try {
    await page.getByRole('button', { name: 'Statistik', exact: true }).click(); await page.getByRole('combobox', { name: 'QR-kode', exact: true }).selectOption('b1/qr1');
    await page.getByRole('button', { name: 'Vis statistik', exact: true }).click(); await page.getByText('Registrerede åbninger', { exact: true }).waitFor();
    await page.getByRole('note', { name: 'Foreløbige tal' }).waitFor();
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

test('bulk success cannot erase an unresolved editor write or its original retry identity',async()=>{
  const saved={...base,name:'Uncertain edit',revision:'2'};
  const {page,calls}=await open({answers:['abort',[200,bulkPreview],[200,{records:[bulkRecord]}],[200,{...initial,codes:[base,bulkRecord]}],[200,saved],[200,{...initial,codes:[saved,bulkRecord]}]]});
  try{
    await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
    await page.getByLabel('Navn',{exact:true}).fill(saved.name);
    await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();
    await page.getByRole('button',{name:'Prøv samme handling igen',exact:true}).waitFor();
    await page.getByRole('button',{name:'CSV-import',exact:true}).click();
    await page.getByLabel('CSV-data',{exact:true}).fill('name,destination,brand_id,location_id\nCSV bord,https://example.com/csv,b1,l1\n');
    await page.getByRole('button',{name:'Kontrollér CSV',exact:true}).click();
    await page.getByRole('checkbox',{name:'Jeg vil oprette 1 dynamiske QR-koder for Esmeralda.',exact:true}).check();
    await page.getByRole('button',{name:'Opret 1 QR-koder',exact:true}).click();
    await page.getByRole('status').filter({hasText:'1 QR-koder er oprettet.'}).waitFor();
    await page.getByRole('button',{name:'Administration',exact:true}).click();
    assert.equal(await page.getByLabel('Navn',{exact:true}).inputValue(),saved.name);
    assert.equal(await page.getByLabel('Navn',{exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Prøv samme handling igen',exact:true}).click();
    await page.getByRole('heading',{name:saved.name,exact:true}).waitFor();
    assert.deepEqual(calls[4].body,calls[0].body);
    await page.getByRole('heading',{name:'CSV bord',exact:true}).waitFor();
  }finally{await page.close();}
});

test('bulk creation is unavailable while disabled or without create capability', async () => {
  for (const query of ['?off', '?exportonly']) {
    const { page, calls } = await open({ query });
    try { assert.equal(await page.getByRole('button', { name: 'CSV-import', exact: true }).count(), 0); assert.equal(calls.length, 0); }
    finally { await page.close(); }
  }
});

test('logo/design upload works before save and survives save/reopen; exports require saved unchanged design', async () => {
  const png=(await require('sharp')({create:{width:64,height:64,channels:4,background:'#123322'}}).png().toBuffer()).toString('base64');
  let saved;
  const { page, calls } = await open({ answers: [
    (route,body)=>{assert.equal(body.action,'save');assert.equal(body.draft.style.logoBase64,png);assert.equal(body.draft.style.logoSizePercent,30);saved={...base,...body.draft,revision:'2'};return route.fulfill({json:saved});},
    (route,body)=>{assert.equal(body.action,'list');return route.fulfill({json:{...initial,codes:[saved]}});},
    [200,{content:png,mime:'image/png',encoding:'base64',filename:'logo-qr.png'}]
  ] });
  try {
    await page.getByRole('button', { name: 'Opret QR-kode', exact: true }).click();
    await page.getByRole('heading',{name:'Logo og print',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'PNG med valgt logo',exact:true}).isEnabled(),false);
    await page.getByRole('button', { name: 'Annullér', exact: true }).click();
    await page.getByRole('button', { name: 'Redigér Bord 1', exact: true }).click();
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByText('Valgt logo: logo.png',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Logostørrelse',{exact:true}).inputValue(),'25');
    await page.getByLabel('Logostørrelse',{exact:true}).selectOption('30');
    await page.getByRole('button',{name:'Prikker',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'PNG med valgt logo',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();
    await page.getByText('QR-koden er gemt.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
    await page.getByText('Valgt logo: Gemt logo',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Logostørrelse',{exact:true}).inputValue(),'30');
    assert.equal(await page.getByRole('button',{name:'Prikker',exact:true}).getAttribute('aria-pressed'),'true');
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG med valgt logo',exact:true}).click();
    assert.equal((await download).suggestedFilename(),'logo-qr.png');
    assert.equal(calls[2].body.draft.style.logoSizePercent,30);assert.equal(calls.length,3);assert.equal(calls[2].body.logoBase64,undefined);assert.equal(calls[2].body.draft.style.logoBase64,png);assert.equal(calls[2].body.draft.style.moduleShape,'dots');
    assert.deepEqual(calls[2].body.context,{id:'qr1',revision:'2'});
  }finally{await page.close();}
});

test('static print works with dynamic runtime off and export-only permission', async () => {
  const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'"></head><body><h1>Statisk print</h1></body></html>';
  const { page, calls } = await open({ query: '?off&exportonly', answers: [[200, { content: html, mime: 'text/html', filename: 'qr-print.html' }]] }); let popup;
  try {
    await page.getByRole('button', { name: 'Generér statisk QR-kode', exact: true }).click();
    await page.getByRole('combobox', { name: 'Indholdstype', exact: true }).selectOption('text'); await page.getByLabel('Tekst', { exact: true }).fill('hej');
    await page.getByText('Ved statiske koder bruges logo og design kun til eksport og gemmes ikke.', {exact:false}).waitFor();
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
    await page.getByLabel('Flere handlinger for Anden kode', { exact: true }).click();
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

for(const width of [390,1440]) test(`styled catalogue renders actual code, opens scoped statistics and previews logo at ${width}px`,async()=>{
  const {loadTs}=require('../helpers/load-ts.cjs');const {renderQr}=loadTs('src/lib/qr/render.ts',{sharp:{default:require('sharp')},jsqr:{default:require('jsqr')}});
  const real=await renderQr('https://orderfly.dk/q/'+'a'.repeat(32));
  const {page,calls}=await open({query:'?design',width,answers:[route=>route.fulfill({json:{payload:'https://orderfly.dk/q/'+'a'.repeat(32),imageUrl:'data:image/png;base64,'+real.png.toString('base64')}})]});
  try{
    await page.getByRole('img',{name:'QR-kode: Pepperoni',exact:true}).waitFor();
    assert.equal(calls.length,1);assert.equal(calls[0].body.action,'render');assert.equal(calls[0].body.format,'preview');
    assert.deepEqual(calls[0].body.context,{id:'qr1',revision:'1'});
    const card=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Pepperoni',exact:true})});
    await card.getByText('18',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.QR_DESIGN_SCREENSHOTS)await page.screenshot({path:`/tmp/qr-workspace-catalogue-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Statistik for Pepperoni',exact:true}).click();
    await page.getByRole('button',{name:'Administration',exact:true}).click();
    assert.equal(calls[1].body.action,'analytics');assert.equal(calls[1].body.id,'qr1');assert.equal(calls[1].body.brandId,'b1');
    await page.getByRole('button',{name:'Redigér Pepperoni',exact:true}).click();
    await page.route('**/api/qr/admin', async route=>{
      const body=route.request().postDataJSON();assert.equal(body.action,'render');
      const rendered=await renderQr('https://orderfly.dk/q/'+'a'.repeat(32),{...body.draft.style,...(body.logoBase64?{logo:Buffer.from(body.logoBase64,'base64'),errorCorrectionLevel:'H'}:{})});
      return route.fulfill({json:{content:rendered.png.toString('base64'),mime:'image/png',encoding:'base64',filename:'qr.png'}});
    });
    const logo=await require('sharp')(Buffer.from('<svg width="100" height="100"><rect width="100" height="100" fill="white"/><text x="50" y="73" text-anchor="middle" font-size="65" fill="#164e3b">E</text></svg>')).png().toBuffer();
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'test-brand.png',mimeType:'image/png',buffer:logo});
    await page.getByRole('button',{name:'Preview QR',exact:true}).click();
    await page.getByRole('img',{name:'QR-preview med valgt design og logo',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.QR_DESIGN_SCREENSHOTS){await page.getByRole('region',{name:'Logo og print',exact:true}).screenshot({path:`/tmp/qr-workspace-design-${width}.png`});await page.screenshot({path:`/tmp/qr-workspace-editor-${width}.png`,fullPage:true});}
  }finally{await page.close();}
});

test('catalogue counters keep brand scope, unknown and zero distinct, and statistics opens the selected code', async()=>{
  const {page,calls}=await open({query:'?lifetime&collision'});
  try{
    const card=name=>page.getByRole('listitem').filter({has:page.getByRole('heading',{name,exact:true})});
    await card('Bord 1').getByText('7',{exact:true}).waitFor();await card('Anden kode').getByText('18',{exact:true}).waitFor();
    await card('Gammel kode').getByText('Ukendt',{exact:true}).waitFor();await card('Ny tom kode').getByText('0',{exact:true}).waitFor();
    assert.equal(await card('Ingen totaladgang').locator('.qr-card-count').count(),0);
    await page.getByLabel('Sortering',{exact:true}).selectOption('scans');
    assert.equal(await page.getByRole('list',{name:'Gemte QR-koder',exact:true}).getByRole('heading').first().innerText(),'Anden kode');
    await page.getByRole('button',{name:'Statistik for Anden kode',exact:true}).click();
    await page.getByRole('heading',{name:'QR-statistik',exact:true}).waitFor();
    assert.equal(calls[0].body.brandId,'b2');assert.equal(calls[0].body.id,'qr1');
  }finally{await page.close();}
});
test('catalogue pagination is bounded and filters reset the selected page',async()=>{
  const {page,calls}=await open({query:'?pages'});
  try{
    const rows=page.getByRole('list',{name:'Gemte QR-koder',exact:true}).getByRole('listitem');
    assert.equal(await rows.count(),12);
    await page.getByRole('button',{name:'Næste',exact:true}).click();assert.equal(await rows.count(),1);
    await page.getByLabel('Søg QR-koder',{exact:true}).fill('Kode 00');
    await rows.getByRole('heading',{name:'Kode 00',exact:true}).waitFor();assert.equal(await rows.count(),1);
    assert.equal(calls.length,0);
  }finally{await page.close();}
});

 test('catalogue analytics actions follow per-code grants across brands and fail closed without eligibility',async()=>{
  const {page,calls}=await open({query:'?collision&mixedanalytics'});
  try{
   assert.equal(await page.getByRole('button',{name:'Statistik for Anden kode',exact:true}).count(),0);
   await page.getByRole('button',{name:'Statistik for Bord 1',exact:true}).click();
   assert.equal(calls.length,1);assert.equal(calls[0].body.brandId,'b1');assert.equal(calls[0].body.id,'qr1');
  }finally{await page.close();}
 });

test('editor without export can upload/save designs and preview through view authorization, without download controls',async()=>{
 const png=(await require('sharp')({create:{width:32,height:32,channels:4,background:'#123322'}}).png().toBuffer()).toString('base64');
 let saved;
 const {page,calls}=await open({query:'?editonly',answers:[
  (route,body)=>{assert.equal(body.action,'render');assert.equal(body.format,'preview');return route.fulfill({json:{payload:'https://orderfly.dk/q/'+'a'.repeat(32),imageUrl:'data:image/png;base64,'+png}});},
  (route,body)=>{assert.equal(body.action,'save');saved={...base,...body.draft,revision:'2'};assert.equal(saved.style.moduleShape,'rounded');assert.equal(saved.style.logoBase64,png);return route.fulfill({json:saved});},
  (route,body)=>{assert.equal(body.action,'list');return route.fulfill({json:{...initial,capabilities:{create:true,edit:true,archive:false,export:false},codes:[saved]}});}
 ]});
 try{
  await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
  await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByText('Valgt logo: logo.png',{exact:true}).waitFor();await page.getByRole('button',{name:'Afrundede',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'PNG med valgt logo',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Åbn print / Gem som PDF',exact:true}).count(),0);
  await page.getByRole('button',{name:'Preview QR',exact:true}).click();await page.getByRole('img',{name:'QR-preview med valgt design og logo'}).waitFor();
  await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();await page.getByText('QR-koden er gemt.',{exact:true}).waitFor();
  assert.ok(calls.every(c=>c.body.action!=='render'||c.body.format==='preview'));
 }finally{await page.close();}
});


test('JPEG decoding locks design controls, then save below the designer persists logo on reopen',async()=>{
 const jpeg=await require('sharp')({create:{width:2048,height:1138,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
 const logo=jpeg.toString('base64');let saved;
 const {page,calls}=await open({answers:[
  (route,body)=>{assert.equal(body.action,'save');assert.equal(body.draft.style.logoBase64,logo);assert.equal(body.draft.style.moduleShape,'dots');saved={...base,...body.draft,revision:'2'};return route.fulfill({json:saved});},
  (route,body)=>{assert.equal(body.action,'list');return route.fulfill({json:{...initial,codes:[saved]}});}
 ]});
 try{
  await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
  await page.evaluate(()=>{const decode=window.createImageBitmap;window.createImageBitmap=async(...args)=>{await new Promise(resolve=>window.__releaseLogo=resolve);return decode(...args);};});
  await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'landscape-logo.jpg',mimeType:'image/jpeg',buffer:jpeg});
  await page.waitForFunction(()=>!!window.__releaseLogo);
  for(const name of ['Prikker','Ekstra afrundede alle hjørner','Preview QR','Gem QR-kode','Annullér'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true,name+' must wait for logo decoding');
  await page.evaluate(()=>window.__releaseLogo());
  await page.getByRole('img',{name:'Valgt logo',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Gem QR-kode',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Prikker',exact:true}).click();
  assert.equal(await page.evaluate(()=>!!(document.querySelector('section[aria-label="Logo og print"]').compareDocumentPosition(document.querySelector('button[type="submit"]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
  await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();await page.getByText('QR-koden er gemt.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
  await page.getByRole('img',{name:'Valgt logo',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Prikker',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(calls.filter(c=>c.body.action==='save').length,1);
 }finally{await page.close();}
});

test('rejected logo releases the entire editor and shows its validation error',async()=>{
 const {page,calls}=await open();
 try{
  await page.getByRole('button',{name:'Redigér Bord 1',exact:true}).click();
  await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,0])});
  await page.getByRole('alert').filter({hasText:'Vælg et gyldigt PNG- eller JPEG-logo'}).waitFor();
  for(const name of ['Prikker','Gem QR-kode','Annullér'])assert.equal(await page.getByRole('button',{name,exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('img',{name:'Valgt logo',exact:true}).count(),0);assert.equal(calls.length,0);
 }finally{await page.close();}
});

test('new QR draft previews explicitly black on white with the uploaded logo',async()=>{
 const png=await require('sharp')({create:{width:32,height:32,channels:3,background:'#fff'}}).png().toBuffer();
 const {page,calls}=await open({answers:[(route,body)=>{
  assert.equal(body.action,'render');assert.equal(body.draft.style.dark,'#000000');assert.equal(body.draft.style.light,'#ffffff');assert.equal(body.draft.style.logoBase64,png.toString('base64'));
  return route.fulfill({json:{content:png.toString('base64'),mime:'image/png',encoding:'base64',filename:'qr.png'}});
 }]});
 try{
  await page.getByRole('button',{name:'Opret QR-kode',exact:true}).click();
  assert.equal(await page.getByLabel('Kodefarve',{exact:true}).inputValue(),'#000000');
  await page.getByLabel('Kodetype',{exact:true}).selectOption('static');
  await page.getByLabel('Webadresse',{exact:true}).fill('https://example.org');
  await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
  await page.getByRole('img',{name:'Valgt logo',exact:true}).waitFor();
  await page.getByRole('button',{name:'Preview QR',exact:true}).click();
  await page.getByRole('img',{name:'QR-preview med valgt design og logo',exact:true}).waitFor();assert.equal(calls.length,1);
 }finally{await page.close();}
});
