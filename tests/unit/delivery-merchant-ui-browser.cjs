// Render the actual superadmin React overview with production CSS. Only API data
// and server-provided authorized selector metadata are synthetic, never a login.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
const brands = [{ id: 'a', name: 'Nord' }, { id: 'b', name: 'Syd' }];
const locations = [{ id: 'la', name: 'Nord Station', brandId: 'a' }, { id: 'lb', name: 'Syd Torv', brandId: 'b' }];
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-merchant-browser-'));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
    import {DeliveryMerchantOverview} from ${JSON.stringify(path.join(root,'src/components/delivery/merchant-overview.tsx'))};
    import {DeliveryMerchantDetail} from ${JSON.stringify(path.join(root,'src/components/delivery/merchant-detail.tsx'))};
    import {DeliveryPlatformSettings} from ${JSON.stringify(path.join(root,'src/components/delivery/platform-settings.tsx'))};
    const catalog={brands:${JSON.stringify(brands)},locations:${JSON.stringify(locations)}};
    const parts=location.pathname.split('/').filter(Boolean),mode=parts[0]==='superadmin'?(parts[2]==='new'?'new':parts[2]==='platform'?'platform':parts[2]?'detail':'overview'):parts[0],id='a'.repeat(64);
    const props={catalog,canEdit:true,...(mode==='detail'||mode==='action'?{merchantId:id}:{}),...(mode==='action'?{action:parts[1]}:{})};
    createRoot(document.getElementById('root')).render(mode==='platform'?React.createElement(DeliveryPlatformSettings):mode==='detail'||mode==='new'||mode==='action'?React.createElement(DeliveryMerchantDetail,props):React.createElement(DeliveryMerchantOverview,{...catalog,canEdit:true,platformAdmin:true}));`);
  const loader = path.join(dir, 'loader.js');
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="admin-shell min-h-screen bg-background p-4 md:p-8"><div id="root" class="mx-auto max-w-6xl"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
const id='a'.repeat(64);
const merchant=(patch={})=>({id,brandId:'a',locationId:'la',environment:'sandbox',displayName:'Nord levering',merchantId:'wolt-a',venueId:'venue-a',pickupContact:{name:'Køkken',phone:'+4512345678',verifiedAt:'2026-10-26T10:00:00Z'},status:'draft',revision:1,credentials:{apiConfigured:true,webhookConfigured:true},callbackStatus:'unregistered',connectionStatus:'untested',connectionCheckedAtMs:null,operationPending:false,productionApproved:false,createdAtMs:1,updatedAtMs:1,...patch});
const defaults={enabled:false,providerId:'wolt',timezone:'Europe/Copenhagen',paused:false,pricingRules:null,weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:[]})),exceptions:[],preparationMinutes:20,maxTransportMinutes:60,maxDistanceMeters:10000};
async function settings(page){await page.route('**/api/delivery/settings?*',route=>route.fulfill({json:{brandId:'a',locationId:'la',brandRevision:0,revision:0,settings:defaults,brandSettings:defaults,overrides:{},inheritedKeys:Object.keys(defaults),editable:true}}));}
async function fixture(t,width=390,height=844){const context=await browser.newContext({viewport:{width,height}});t.after(()=>context.close());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));return {page,errors};}
for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]])test(`enrolled-only table filters and separate page links at ${width}x${height}`,async t=>{
 const {page,errors}=await fixture(t,width,height);await page.route('**/api/delivery/merchants',route=>route.fulfill({json:{merchants:[merchant()],nextCursor:null}}));await page.goto(origin);
 await expect(page.getByRole('rowheader',{name:'Nord levering',exact:true})).toBeVisible();assert.equal(await page.getByRole('rowheader').count(),1);
 await expect(page.getByRole('button',{name:'Indstillinger',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Tilføj merchant',exact:true})).toHaveAttribute('href','/superadmin/delivery/new');
 await expect(page.getByRole('link',{name:'Fælles ruteindstillinger',exact:true})).toHaveAttribute('href','/superadmin/delivery/platform');
 await expect(page.getByRole('link',{name:'Rediger Nord levering',exact:true})).toHaveAttribute('href','/superadmin/delivery/'+id);
 await expect(page.getByRole('link',{name:'Deaktivér Nord levering',exact:true})).toHaveAttribute('href','/superadmin/delivery/'+id+'/deactivate');
 await expect(page.getByRole('link',{name:'Slet Nord levering',exact:true})).toHaveAttribute('href','/superadmin/delivery/'+id+'/delete');
 await expect(page.getByRole('combobox',{name:'Brand',exact:true}).locator('option[value="b"]')).toHaveCount(0);await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption('a');await expect(page.getByRole('rowheader')).toHaveCount(1);await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('inactive');await expect(page.getByText('Ingen restauranter matcher filtrene.')).toBeVisible();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('');await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption('');
 await page.getByRole('combobox',{name:'Miljø',exact:true}).selectOption('production');await expect(page.getByRole('rowheader')).toHaveCount(0);await page.getByRole('combobox',{name:'Miljø',exact:true}).selectOption('');
 await page.getByLabel('Søg restaurant',{exact:true}).fill('ingen');await expect(page.getByRole('rowheader')).toHaveCount(0);await page.getByLabel('Søg restaurant',{exact:true}).fill('Nord');await expect(page.getByRole('rowheader')).toHaveCount(1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
});
test('merchant detail keeps secrets write-only, clears after save, retains scope and embeds only scoped settings',async t=>{
 const {page,errors}=await fixture(t,768,1024);let row=merchant(),writes=[];await settings(page);await page.route('**/api/delivery/merchants/'+id,async route=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();writes.push(body);row={...row,displayName:body.displayName,revision:2};}await route.fulfill({json:{merchant:row}});});await page.goto(origin+'/detail');
 await expect(page.getByRole('heading',{name:'Nord levering',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Brand',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Restaurant',exact:true})).toBeDisabled();
 const secret=page.getByLabel('API-nøgle (gemt)',{exact:true});await expect(secret).toHaveAttribute('type','password');await expect(secret).toHaveValue('');await secret.fill('synthetic-api-secret-only');await page.getByLabel('Visningsnavn',{exact:true}).fill('Nord opdateret');
 const save=page.getByRole('button',{name:'Gem merchant',exact:true});await save.focus();await page.keyboard.press('Enter');await expect(page.getByText('Merchantens opsætning er gemt.')).toBeVisible();assert.equal(writes.length,1);assert.equal(writes[0].credentials.apiKey,'synthetic-api-secret-only');assert.equal(writes[0].expectedRevision,1);assert.equal('brandId' in writes[0],false);await expect(secret).toHaveValue('');
 await expect(page.getByRole('button',{name:'Leverandører',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Indstillinger',exact:true})).toBeVisible();assert.deepEqual(errors,[]);
});
test('create merchant submits one request; uncertain response clears secrets and blocks blind retry',async t=>{
 const {page}=await fixture(t);let writes=[];await page.route('**/api/delivery/merchants',async route=>{writes.push(route.request().postDataJSON());await new Promise(r=>setTimeout(r,100));await route.fulfill({status:503,json:{error:'configuration_unavailable'}});});await page.goto(origin+'/new');
 for(const [label,value]of [['Brand','a'],['Restaurant','la']])await page.getByRole('combobox',{name:label,exact:true}).selectOption(value);
 for(const [label,value]of [['Visningsnavn','Nord ny'],['Wolt Merchant ID','merchant-new'],['Wolt Venue ID','venue-new'],['Afhentningskontakt','Testkontakt'],['Afhentningstelefon','+4512345678']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('checkbox',{name:'Afhentningskontakt og telefon er verificeret for denne restaurant.'}).check();await page.getByLabel('API-nøgle (ikke gemt)',{exact:true}).fill('synthetic-new-secret');
 await page.getByRole('button',{name:'Tilføj merchant',exact:true}).evaluate(el=>{el.click();el.click();});await expect(page.getByRole('alert')).toContainText('Handlingen kunne ikke bekræftes');assert.equal(writes.length,1);assert.equal(writes[0].environment,'sandbox');assert.equal(writes[0].brandId,'a');await expect(page.getByLabel('API-nøgle (ikke gemt)',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Tilføj merchant',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toBeFocused();
});
test('delete dedicated page requires confirmation, submits once, preserves archived status',async t=>{
 const {page}=await fixture(t);let writes=[];await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:merchant()}}));await page.route('**/api/delivery/merchants/'+id+'/actions',async route=>{writes.push(route.request().postDataJSON());await new Promise(r=>setTimeout(r,100));await route.fulfill({json:{merchant:merchant({status:'archived',revision:2})}});});await page.goto(origin+'/action/delete');
 const button=page.getByRole('button',{name:'Slet merchant',exact:true});await expect(button).toBeDisabled();await page.getByRole('checkbox').check();await button.evaluate(el=>{el.click();el.click();});await expect(page.getByText('Merchant er arkiveret. Ordre- og leveringshistorik er bevaret.')).toBeVisible();assert.deepEqual(writes,[{action:'delete',expectedRevision:1}]);await expect(button).toBeDisabled();
});
test('production activation needs explicit second consent and pending operations remain locked',async t=>{
 const {page}=await fixture(t);await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:merchant({environment:'production'})}}));await page.goto(origin+'/action/activate');const button=page.getByRole('button',{name:'Aktivér opsætning',exact:true});await page.getByRole('checkbox',{name:'Jeg har kontrolleret restaurant og miljø og ønsker at fortsætte.'}).check();await expect(button).toBeDisabled();await page.getByRole('checkbox',{name:'Jeg godkender udtrykkeligt aktivering i produktion.'}).check();await expect(button).toBeDisabled();const venue=page.getByRole('checkbox',{name:'Jeg har kontrolleret hos Wolt, at venueets afhentningsadresse svarer til restaurantens adresse.'});await expect(venue).not.toBeChecked();await venue.check();await expect(button).toBeEnabled();
 await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:merchant({operationPending:true})}}));await page.goto(origin+'/action/activate');await expect(page.getByRole('alert')).toContainText('afventer afklaring');await expect(page.getByRole('checkbox').first()).toBeDisabled();await page.goto(origin+'/action/deactivate');await expect(page.getByRole('checkbox')).toBeEnabled();
});
test('platform shared form preserves saved key on omission and connection test uses saved revision',async t=>{
 const {page}=await fixture(t,1024,768);let data={revision:1,enabled:false,retentionApproved:true,routingApprovalRef:'approval-route',retentionApprovalRef:'approval-retention',quotaNamespace:'shared-sandbox',keyConfigured:true,limits:{quotesPerDay:100,requestsPerSecond:5}},writes=[],checks=[];
 await page.route('**/api/delivery/platform',async route=>{if(route.request().method()==='PUT'){const body=route.request().postDataJSON();writes.push(body);data={...data,...body,revision:2};}await route.fulfill({json:data});});await page.route('**/api/delivery/platform/check',route=>{checks.push(route.request().postDataJSON());return route.fulfill({json:{ok:true,code:'connected',revision:2,checkedAt:'2026-10-26T10:00:00Z'}});});await page.goto(origin+'/platform');await expect(page.getByLabel('API-nøgle',{exact:true})).toHaveValue('');await page.getByRole('checkbox',{name:'Aktivér fælles Geoapify-rutetjeneste'}).check();await page.getByRole('button',{name:'Gem fælles indstillinger'}).click();await expect(page.getByText('De fælles ruteindstillinger er gemt.')).toBeVisible();assert.equal('apiKey' in writes[0],false);assert.equal('quotaNamespace' in writes[0],false);assert.equal('routingApprovalRef' in writes[0],false);assert.equal(writes[0].expectedRevision,1);await expect(page.getByLabel('Fælles kvoteidentifikation',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Test Geoapify-forbindelse'}).click();await expect(page.getByText('Forbindelsen til Geoapify er bekræftet.')).toBeVisible();assert.deepEqual(checks,[{expectedRevision:2}]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
test('successful create opens dedicated detail and appears in enrolled overview',async t=>{
 const {page}=await fixture(t);let rows=[],writes=[];await settings(page);
 await page.route('**/api/delivery/merchants',route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);rows=[merchant({displayName:body.displayName})];return route.fulfill({json:{merchant:rows[0]}});}return route.fulfill({json:{merchants:rows,nextCursor:null}});});
 await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:rows[0]}}));
 await page.goto(origin+'/new');for(const [name,value]of [['Brand','a'],['Restaurant','la']])await page.getByRole('combobox',{name,exact:true}).selectOption(value);
 for(const [label,value]of [['Visningsnavn','Nord tilføjet'],['Wolt Merchant ID','merchant-new'],['Wolt Venue ID','venue-new'],['Afhentningskontakt','Testkontakt'],['Afhentningstelefon','+4512345678']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('checkbox',{name:'Afhentningskontakt og telefon er verificeret for denne restaurant.'}).check();await page.getByRole('button',{name:'Tilføj merchant',exact:true}).click();
 await page.waitForURL('**/superadmin/delivery/'+id);await expect(page.getByRole('heading',{name:'Nord tilføjet',exact:true})).toBeVisible();assert.equal(writes.length,1);
 await page.getByRole('link',{name:'Tilbage til Levering',exact:true}).click();await expect(page.getByRole('rowheader',{name:'Nord tilføjet',exact:true})).toBeVisible();assert.equal(await page.getByRole('rowheader').count(),1);
});
test('archived toggle reveals saved history and restore stays deactivated',async t=>{
 const {page}=await fixture(t);let queries=[],actions=[];await page.route('**/api/delivery/merchants?*',route=>{queries.push(route.request().url());return route.fulfill({json:{merchants:[merchant({status:'archived'})],nextCursor:null}});});await page.route('**/api/delivery/merchants',route=>route.fulfill({json:{merchants:[],nextCursor:null}}));await page.goto(origin);await expect(page.getByText('Ingen merchants er tilføjet endnu.')).toBeVisible();await page.getByRole('checkbox',{name:'Vis arkiverede merchants'}).check();await expect(page.getByRole('link',{name:'Gendan Nord levering',exact:true})).toHaveAttribute('href','/superadmin/delivery/'+id+'/restore');assert.ok(queries[0].includes('includeArchived=true'));
 await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:merchant({status:'archived'})}}));await page.route('**/api/delivery/merchants/'+id+'/actions',route=>{actions.push(route.request().postDataJSON());return route.fulfill({json:{merchant:merchant({status:'inactive',revision:2})}});});await page.goto(origin+'/action/restore');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Gendan merchant',exact:true}).click();await expect(page.getByText('Merchant er gendannet som deaktiveret. Kontrollér opsætningen før aktivering.')).toBeVisible();assert.deepEqual(actions,[{action:'restore',expectedRevision:1}]);await expect(page.getByText('Deaktiveret',{exact:true})).toBeVisible();
});
test('sandbox activation sends explicit venue attestation only after separate checkbox',async t=>{
 const {page}=await fixture(t);let actions=[];await page.route('**/api/delivery/merchants/'+id,route=>route.fulfill({json:{merchant:merchant()}}));await page.route('**/api/delivery/merchants/'+id+'/actions',route=>{actions.push(route.request().postDataJSON());return route.fulfill({json:{merchant:merchant({status:'active',revision:2})}});});await page.goto(origin+'/action/activate');const button=page.getByRole('button',{name:'Aktivér opsætning',exact:true});
 await page.getByRole('checkbox',{name:'Jeg har kontrolleret restaurant og miljø og ønsker at fortsætte.'}).check();await expect(button).toBeDisabled();const venue=page.getByRole('checkbox',{name:'Jeg har kontrolleret hos Wolt, at venueets afhentningsadresse svarer til restaurantens adresse.'});await expect(venue).not.toBeChecked();await venue.check();await button.click();await expect(page.getByText('Handlingen er gemt. Kontrollér den opdaterede status nedenfor.')).toBeVisible();assert.deepEqual(actions,[{action:'activate',expectedRevision:1,pickupVenueConfirmed:true}]);await expect(button).toBeDisabled();await expect(venue).not.toBeChecked();
});
