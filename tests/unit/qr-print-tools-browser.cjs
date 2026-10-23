const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), ts = require('typescript');
const { chromium } = require('@playwright/test');
const sharp = require('sharp');
let browser, server, origin, png;
const draft = { name: 'Bord 1', brandId: 'b1', locationId: 'l1', kind: 'dynamic', destination: 'https://example.org', staticType: 'url', fields: {}, campaign: 'Oktober', tags: [], utm: { source: '', medium: 'qr', campaign: '', content: '', term: '' }, style: { width: 512, dark: '#123322', light: '#fff9ef', margin: 4, errorCorrectionLevel: 'M' } };
const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'"></head><body><h1>QR print</h1></body></html>';
before(async () => {
  png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#111111' } }).png().toBuffer();
  const component = ts.transpileModule(fs.readFileSync('src/app/superadmin/qr-codes/qr-print-tools.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const react = path.dirname(require.resolve('react/package.json')), dom = path.dirname(require.resolve('react-dom/package.json'));
  const boot = `const options=new URLSearchParams(location.search);window.__urls=[];window.__revoked=[];
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);window.__urls.push(url);return url};URL.revokeObjectURL=url=>{window.__revoked.push(url);revoke(url)};
    if(options.has('blocked'))window.open=()=>null;
    window.__unmount=()=>root.unmount();window.__draft=${JSON.stringify(draft)};
    const render=async(draft,context,options)=>{const response=await fetch('/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({draft,context,options})});if(!response.ok)throw Error('failed');return response.json()};
    const root=ReactDOM.createRoot(document.getElementById('root'));const draw=()=>root.render(React.createElement(module.exports.QrPrintTools,{draft:window.__draft,context:options.has('unsaved')?{}:{id:'q1',revision:'r1'},render,...(options.has('persist')?{onDesignChange:style=>{window.__draft={...window.__draft,style};window.__savedDesign=style;draw();}}:{})}));window.__changeScope=()=>{window.__draft={...window.__draft,brandId:'b2'};draw()};draw();`;
  server = http.createServer((req, res) => {
    if (req.url === '/react.js') { res.setHeader('content-type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(react, 'umd/react.development.js'))); }
    if (req.url === '/dom.js') { res.setHeader('content-type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(dom, 'umd/react-dom.development.js'))); }
    if (req.url === '/component.js') { res.setHeader('content-type', 'application/javascript; charset=utf-8'); return res.end('window.module={exports:{}};window.exports=module.exports;window.require=name=>{if(name!=="react")throw Error(name);return React};\n' + component + '\n' + boot); }
    res.setHeader('content-type', 'text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/react.js"></script><script src="/dom.js"></script><script src="/component.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.CART_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open({ width = 390, query = '', answer } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true }), calls = [], errors = [];
  page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/render', async route => {
    const data = route.request().postDataJSON(); calls.push(data);
    if (answer) return answer(route, data);
    const format = data.options.format, asset = format === 'png' ? { content: png.toString('base64'), mime: 'image/png', encoding: 'base64', filename: '../qr.png' }
      : format === 'svg' ? { content: '<svg xmlns="http://www.w3.org/2000/svg"/>', mime: 'image/svg+xml', filename: 'qr.svg' } : { content: html, mime: 'text/html', filename: 'qr.html' };
    return route.fulfill({ json: asset });
  });
  await page.goto(origin + '/?' + query); await page.getByRole('heading', { name: 'Logo og print', exact: true }).waitFor();assert.deepEqual(errors, []);
  return { page, calls };
}
for (const width of [390, 1440]) test(`PNG and SVG downloads preserve context, force H and clean blob URLs at ${width}px`, async () => {
  const { page, calls } = await open({ width });
  try {
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
    await page.getByText('Valgt logo: logo.png', { exact: true }).waitFor();
    for (const format of ['PNG', 'SVG']) {
      const download = page.waitForEvent('download'); await page.getByRole('button', { name: `${format} med valgt logo`, exact: true }).click();
      assert.ok((await download).suggestedFilename().endsWith(format.toLowerCase()));
    }
    assert.equal(calls.length, 2); assert.deepEqual(calls[0].context, { id: 'q1', revision: 'r1' });
    assert.equal(calls[0].options.logoBase64, png.toString('base64')); assert.equal(calls[0].draft.style.errorCorrectionLevel, 'H');
    assert.equal(calls[0].draft.style.dark, draft.style.dark); assert.equal(calls[0].draft.style.width, 512);
    assert.equal(await page.evaluate(() => window.__draft.style.errorCorrectionLevel), 'M');
    await page.evaluate(() => window.__unmount());
    assert.deepEqual(await page.evaluate(() => window.__revoked), await page.evaluate(() => window.__urls));
  } finally { await page.close(); }
});
test('invalid SVG, spoofed raster and oversized files never reach the renderer', async () => {
  const { page, calls } = await open();
  try {
    for (const file of [{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
      { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload="alert(1)"/>') },
      { name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }]) {
      await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles(file);
      await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('button', { name: 'Fjern logo' }).count(), 0);
    }
    assert.equal(calls.length, 0);
  } finally { await page.close(); }
});
test('removal and scope changes discard the ephemeral logo without storage', async () => {
  const { page, calls } = await open();
  try {
    const upload = async () => { await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });await page.getByRole('button', { name: 'Fjern logo' }).waitFor(); };
    await upload(); await page.getByRole('button', { name: 'Fjern logo' }).click();
    let download = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG med valgt logo' }).click();await download;
    assert.equal('logoBase64' in calls[0].options, false);assert.equal(calls[0].draft.style.errorCorrectionLevel, 'M');
    await upload(); await page.evaluate(() => window.__changeScope());await page.getByRole('button', { name: 'Fjern logo' }).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.length), 0); assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  } finally { await page.close(); }
});
test('print window opens from click, severs opener and displays the trusted HTML blob', async () => {
  const { page, calls } = await open();let popup;
  try {
    const opened = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Åbn print / Gem som PDF' }).click();popup = await opened;
    await popup.getByRole('heading', { name: 'QR print', exact: true }).waitFor();
    assert.equal(await popup.evaluate(() => window.opener), null); assert.ok(popup.url().startsWith('blob:' + origin));
    assert.equal(calls[0].options.format, 'print'); await page.getByRole('status').filter({ hasText: 'Printvinduet er åbnet' }).waitFor();
  } finally { await popup?.close();await page.close(); }
});
test('blocked popup avoids rendering and failed or unsafe output closes the pending print window', async () => {
  let view = await open({ query: 'blocked' });
  try { await view.page.getByRole('button', { name: 'Åbn print / Gem som PDF' }).click();await view.page.getByRole('alert').filter({ hasText: 'blokeret' }).waitFor();assert.equal(view.calls.length, 0); } finally { await view.page.close(); }
  for (const content of ['<script>window.opener.location="https://attacker.invalid"</script>', html.replace('</body>', '<script>alert(1)</script></body>')]) {
    view = await open({ answer: route => route.fulfill({ json: { content, mime: 'text/html', filename: 'qr.html' } }) });let popup;
    try { const opened = view.page.waitForEvent('popup');await view.page.getByRole('button', { name: 'Åbn print / Gem som PDF' }).click();popup=await opened;
      await view.page.getByRole('alert').waitFor();assert.equal(popup.isClosed(), true);assert.equal((await view.page.evaluate(() => window.__urls)).length,0);
    } finally { await popup?.close();await view.page.close(); }
  }
});
test('unsaved dynamic codes cannot export; duplicate clicks are locked while rendering', async () => {
  let view=await open({query:'unsaved'});
  try { assert.equal(await view.page.getByRole('button',{name:'PNG med valgt logo'}).isDisabled(),true);assert.equal(view.calls.length,0); } finally {await view.page.close();}
  let release;view=await open({answer:async route=>{await new Promise(resolve=>{release=resolve});return route.fulfill({status:503,json:{error:'failed'}});}});
  try {await view.page.getByRole('button',{name:'PNG med valgt logo'}).click();await view.page.getByRole('status',{name:''}).filter({hasText:'Klargør eksport'}).waitFor();
    assert.equal(await view.page.getByRole('button',{name:'SVG med valgt logo'}).isDisabled(),true);assert.equal(view.calls.length,1);release();await view.page.getByRole('alert').waitFor();
    assert.equal(await view.page.getByRole('button',{name:'PNG med valgt logo'}).isDisabled(),false);
  } finally {release?.();await view.page.close();}
});

for (const width of [390, 1440]) test(`design preview uses the same validated PNG renderer and logo as export at ${width}px`, async () => {
  const { page, calls } = await open({ width }); let downloads = 0; page.on('download', () => downloads++);
  try {
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Vis designpreview', exact: true }).click();
    await page.getByRole('img', { name: 'QR-preview med valgt design og logo', exact: true }).waitFor();
    assert.equal(downloads, 0);
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG med valgt logo', exact: true }).click(); await download;
    assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].draft.style.errorCorrectionLevel, 'H');
    assert.equal(calls[0].options.logoBase64, png.toString('base64'));
    if (process.env.QR_DESIGN_SCREENSHOTS) await page.screenshot({ path: `/tmp/qr-design-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Fjern logo', exact: true }).click();
    assert.equal(await page.getByRole('img', { name: 'QR-preview med valgt design og logo', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});
test('failed design preview does not create a download or display an unsafe image', async () => {
  const { page } = await open({ answer: route => route.fulfill({ json: { content: '<svg onload="alert(1)"/>', mime: 'image/png', encoding: 'base64' } }) });
  let downloads=0; page.on('download',()=>downloads++);
  try {
    await page.getByRole('button', { name: 'Vis designpreview', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('img', { name: 'QR-preview med valgt design og logo', exact: true }).count(), 0);
    assert.equal(downloads,0);
  } finally { await page.close(); }
});

test('a late design preview from a previous scope is discarded', async () => {
  let pending;
  const {page}=await open({answer:route=>{pending=route;}});
  try{
    const request=page.waitForRequest('**/render');
    await page.getByRole('button',{name:'Vis designpreview',exact:true}).click();await request;
    await page.evaluate(()=>window.__changeScope());
    await pending.fulfill({json:{content:png.toString('base64'),mime:'image/png',encoding:'base64',filename:'qr.png'}});
    await page.getByRole('button',{name:'Vis designpreview',exact:true}).waitFor();
    assert.equal(await page.getByRole('img',{name:'QR-preview med valgt design og logo',exact:true}).count(),0);
  }finally{await page.close();}
});

for(const width of [390,1440])test(`saved design controls propagate logo, module and individual corner choices at ${width}px`,async()=>{
  const {page,calls}=await open({width,query:'persist'});
  try {
    await page.getByLabel('Logo, PNG eller JPEG, højst 2 MB').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
    await page.getByText('Valgt logo: Gemt logo',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__savedDesign.logoBase64),png.toString('base64'));
    await page.getByRole('button',{name:'Prikker',exact:true}).click();
    await page.getByLabel('Tilpas hvert hjørne',{exact:true}).check();
    await page.getByRole('button',{name:'Ekstra afrundede øverst højre',exact:true}).click();
    await page.getByLabel('Brug QR-kodens farve til hjørner',{exact:true}).uncheck();
    assert.deepEqual(await page.evaluate(()=>({shape:window.__savedDesign.moduleShape,corners:window.__savedDesign.cornerShapes,color:window.__savedDesign.cornerColor})),{shape:'dots',corners:['square','extra-rounded','square'],color:draft.style.dark});
    await page.getByRole('button',{name:'Vis designpreview',exact:true}).click();
    await page.getByRole('img',{name:'QR-preview med valgt design og logo'}).waitFor();
    assert.equal(calls.at(-1).options.logoBase64,undefined);assert.equal(calls.at(-1).draft.style.logoBase64,png.toString('base64'));assert.equal(calls.at(-1).draft.style.moduleShape,'dots');assert.equal(calls.at(-1).draft.style.errorCorrectionLevel,'H');
    await page.getByRole('button',{name:'Fjern logo',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__savedDesign.logoBase64),undefined);
    assert.equal(await page.getByRole('img',{name:'QR-preview med valgt design og logo'}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.ok(await page.getByText(/højst 2048 × 2048 pixels/).count());
  } finally {await page.close();}
});
