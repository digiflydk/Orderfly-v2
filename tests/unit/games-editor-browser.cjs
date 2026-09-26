const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();

let directory, server, browser, origin, saved;
const root = process.cwd();
const draft = {
  brandId: 'esmeralda', title: 'Skrab og vind', instruction: 'Skrab her', revealText: 'Prøv igen',
  cardsPerPlay: 3, totalCardLimit: 3000, collectPhone: false, newsletterText: 'Ja tak',
  emailSubject:'Din gevinst er klar',emailMessage:'Her er din personlige gevinstkode.',displayCooldownDays:30,allowedOrigins:[],
  logoUrl: '', backgroundUrl: '', fontUrl: '', primaryColor: '#ffbd02', surfaceColor: '#111111',
  placement: 'selected', paths: ['/'],
  prizes: [{ name: 'Pizza', imageUrl: '', type: 'item', value: 0, probabilityPercent: 10, maxWinners: 100, codeMode: 'generated', redemption: 'restaurant' }],
};
function file(name, code) { const target = path.join(directory, `${name}.js`); fs.writeFileSync(target, code); return target; }

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'games-editor-'));
  const entry = file('entry', `import React from 'react';import{createRoot}from'react-dom/client';import{ScratchCardEditor}from ${JSON.stringify(path.join(root, 'src/components/games/ScratchCardEditor.tsx'))};import{ScratchSurface}from ${JSON.stringify(path.join(root, 'src/components/games/ScratchCard.tsx'))};createRoot(document.getElementById('root')).render(<><ScratchCardEditor brands={[{id:'esmeralda',name:'Esmeralda',slug:'esmeralda',logoUrl:''}]} products={[{id:'pizza_01',name:'Pizza 01'}]} brandId="esmeralda" draft={${JSON.stringify(draft)}} status="test"/><div id="scratch-fixture" style={{width:200}}><ScratchSurface label="Pizza" index={1} round={0} onReveal={()=>document.getElementById('scratch-result').textContent='Pizza afsløret'}/><p id="scratch-result"/></div></>);`);
  const loader = file('loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const actions = file('actions', `export async function saveScratchCardDraft(data){if(JSON.parse(data.get('prizes'))[0].probabilityPercent>100)return{ok:false,message:'Vinderchance må højst være 100 %.'};await fetch('/save',{method:'POST',body:data});return{ok:true,message:'Opsætningen er gemt.'}};export async function importGameCodes(){return{message:'OK'}};export async function sendGameTestEmail(){return{message:'OK'}};export async function setScratchCardStatus(){return{ok:true,message:'OK'}};export async function uploadGameAsset(){return{ok:false,message:'No upload'}};`);
  const schema = file('schema', `export const scratchCardDraftSchema={parse:value=>value};export const esmeraldaScratchTest=()=>(${JSON.stringify(draft)});`);
  const preview = file('preview', `import React from 'react';export function ScratchGame({game}){return <div data-testid="preview">{game.title}: {game.cardsPerPlay} felter</div>}`);
  const navigation = file('navigation', `export const useRouter=()=>({push:()=>{},refresh:()=>{}});`);
  const aliases = {
    '@/app/superadmin/games/actions': actions,
    '@/lib/games/scratch-card': schema,
    '@/lib/games/scratch-card-preview': path.join(root,'src/lib/games/scratch-card-preview.ts'),
    './ScratchGame': preview,
    'next/navigation': navigation,
    'react$': require.resolve('next/dist/compiled/react'),
    'react/jsx-runtime$': require.resolve('next/dist/compiled/react/jsx-runtime'),
    'react-dom$': require.resolve('next/dist/compiled/react-dom'),
    'react-dom/client$': require.resolve('next/dist/compiled/react-dom/client'),
  };
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: directory, filename: 'bundle.js' }, resolve: { alias: aliases, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /games-editor-.*\.js$/, use: [loader] }] } }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  server = http.createServer(async (request, response) => {
    if (request.url === '/bundle.js') { response.setHeader('content-type', 'application/javascript'); return response.end(fs.readFileSync(path.join(directory, 'bundle.js'))); }
    if (request.url === '/save') { const chunks = []; for await (const chunk of request) chunks.push(chunk); const data = await new Request('http://localhost/save', { method: 'POST', headers: { 'content-type': request.headers['content-type'] }, body: Buffer.concat(chunks) }).formData(); saved = Object.fromEntries(data); return response.end('OK'); }
    response.setHeader('content-type', 'text/html; charset=utf-8'); response.end('<meta charset="utf-8"><style>.hidden{display:none}</style><div id="root"></div><script src="/bundle.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('switching steps preserves settings and saves the complete draft', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.getByLabel('Overskrift').fill('Vind en pizza');
    await page.getByLabel('Lodder pr. spil').selectOption('9');
    assert.deepEqual(await page.locator('nav button').allTextContents(), ['1. Spillet', '2. Præmier', '3. Udseende', '4. Test og udgiv']);
    await page.locator('nav button').nth(1).click();
    await page.getByLabel('Vinderchance %').fill('25');
    await page.locator('nav button').nth(2).click();
    await page.getByLabel('Logo', { exact: true }).fill('https://example.com/logo.png');
    await page.locator('nav button').nth(3).click();
    await page.getByRole('button', { name: 'Gem opsætning' }).click();
    await page.getByRole('status').getByText('Opsætningen er gemt.').waitFor();
    assert.equal(saved.title, 'Vind en pizza');
    assert.equal(saved.cardsPerPlay, '9');
    assert.equal(saved.logoUrl, 'https://example.com/logo.png');
    assert.equal(saved.placement, 'selected');
    assert.equal(saved.paths, '/');
    assert.equal(JSON.parse(saved.prizes)[0].probabilityPercent, 25);
    assert.match(await page.getByTestId('preview').innerText(), /9 felter/);
  } finally { await page.close(); }
});

test('an invalid value on another step shows a save error instead of silently blocking submission', async () => {
  const page = await browser.newPage();
  try {
    saved = undefined;
    await page.goto(origin);
    await page.locator('nav button').nth(1).click();
    await page.getByLabel('Vinderchance %').fill('101');
    await page.locator('nav button').nth(2).click();
    await page.getByRole('button', { name: 'Gem opsætning' }).click();
    await page.getByRole('status').getByText('Vinderchance må højst være 100 %.').waitFor();
    assert.equal(saved, undefined);
  } finally { await page.close(); }
});

test('scratch field reveals by gesture without a visible reveal button', async()=>{
  const page=await browser.newPage();
  try{
    await page.goto(origin);
    const field=page.locator('#scratch-fixture');
    assert.equal(await field.getByRole('button',{name:/Afslør kort/}).count(),0);
    const canvas=field.locator('canvas'),box=await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x+15,box.y+20);
    await page.mouse.down();
    for(const y of [20,52,84,116]){
      await page.mouse.move(box.x+15,box.y+y);
      await page.mouse.move(box.x+box.width-15,box.y+y,{steps:14});
    }
    await page.mouse.up();
    await field.getByText('Pizza afsløret').waitFor();
  }finally{await page.close();}
});
