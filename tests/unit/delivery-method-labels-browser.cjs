// Real location form, server save and storefront dialogs. Only I/O is synthetic.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { fixture, location, brand } = require('../helpers/brand-location-fixture.cjs');
const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
const root = process.cwd(); let dir, server, browser, origin, f;
function file(name, code) { const target = path.join(dir, name + '.js'); fs.writeFileSync(target, code); return target; }
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-labels-browser-'));
  const entry = file('entry', `import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
  import {LocationFormPage} from ${JSON.stringify(path.join(root, 'src/components/superadmin/location-form-page.tsx'))};
  import DeliveryMethodModal,{openDeliveryModal} from ${JSON.stringify(path.join(root, 'src/components/modals/DeliveryMethodModal.tsx'))};
  import {DeliveryMethodDialog} from ${JSON.stringify(path.join(root, 'src/components/checkout/delivery-method-dialog.tsx'))};
  fetch('/data').then(r=>r.json()).then(data=>{window.testLocation=data.location;
    function App(){const [open,setOpen]=useState(true);useEffect(()=>{if(!location.pathname.includes('admin')&&!location.pathname.includes('checkout'))openDeliveryModal({brandSlug:new URLSearchParams(location.search).has('generic')?'other':'esmeralda',locationSlug:'amager',location:data.location});},[]);
    if(location.pathname.includes('admin'))return <LocationFormPage location={data.location} brands={[data.brand]}/>;
    if(location.pathname.includes('checkout'))return <DeliveryMethodDialog isOpen={open} setIsOpen={setOpen}/>;
    return <DeliveryMethodModal/>;}
    createRoot(document.getElementById('root')).render(<App/>);
  });`);
  const loader = file('ts-loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const aliases = {
    '@/app/superadmin/locations/actions': file('actions', `export const createOrUpdateLocation=async(_,form)=>{const r=await fetch('/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([...form])});const result=await r.json();if(result.redirect)location.assign('/done');return result;}`),
    '@/hooks/use-toast': file('toast', `const toast=()=>{};export const useToast=()=>({toast});`),
    '@/context/cart-context': file('cart', `export const useCart=()=>({location:window.testLocation,setDeliveryType:mode=>{window.selectedMode=mode;},deliveryFee:39,freeDeliveryDiscountApplied:false});`),
    '@/context/analytics-context': file('analytics', `export const useAnalytics=()=>({trackEvent:()=>{}});`),
    'next/navigation': file('navigation', `export const usePathname=()=>location.pathname;export const useRouter=()=>({push:href=>{window.selectedHref=href;},refresh:()=>location.reload()});`),
    'next/image': file('image', `import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
    'next/link': file('link', `import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
    '@': path.join(root, 'src'),
  };
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' }, resolve: { alias: aliases, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /delivery-labels-browser-.*\.js$/, use: [loader] }] } }).run((err, stats) => err ? reject(err) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/commerce-ui.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/storefront-v2.css'), 'utf8');
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if(url.pathname === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    if(url.pathname === '/data') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ location: await f.locations.getLocationById('l'), brand })); }
    if(url.pathname === '/save') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const form = new FormData(); for (const [key,value] of JSON.parse(raw)) form.append(key,value);
      res.setHeader('content-type','application/json');
      try { res.end(JSON.stringify(await f.locations.createOrUpdateLocation(null,form))); }
      catch(error) { if(error.digest?.startsWith('NEXT_REDIRECT;')) res.end(JSON.stringify({redirect:true})); else throw error; }
      return;
    }
    const storefront = !url.pathname.includes('admin');
    res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"'+(storefront?' data-commerce-root data-brand-slug="esmeralda" data-storefront-version="2"':'')+'></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox','--disable-dev-shm-usage'] });
});
after(async()=>{await browser?.close(); if(server) await new Promise(resolve=>server.close(resolve)); if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function pageFor(t,width=390,patch={}) {
  f=fixture([['brands/b',brand],['locations/l',{...location,brandId:'b',isActive:true,deliveryTypes:['pickup','delivery'],deliveryFee:39,pickupLabel:'Spar 25%',deliveryLabel:'Gratis levering',...patch}]]);
  const context=await browser.newContext({viewport:{width,height:740},reducedMotion:'reduce'}); t.after(()=>context.close());
  const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));return page;
}
for(const width of [320,390]) test(`location labels save and reopen through the actual form/server (${width}px)`,async t=>{
  const page=await pageFor(t,width);await page.goto(origin+'/admin');
  const pickup=page.getByLabel('Label til afhentning',{exact:true}),delivery=page.getByLabel('Label til levering',{exact:true});
  await pickup.waitFor();assert.equal(await pickup.inputValue(),'Spar 25%');assert.equal(await delivery.inputValue(),'Gratis levering');
  assert.equal(await pickup.getAttribute('maxlength'),'40');await pickup.fill('Spar 10% ved afhentning');await delivery.fill('Levering fra 39 kr.');
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done');
  assert.equal(f.records.get('locations/l').pickupLabel,'Spar 10% ved afhentning');assert.equal(f.records.get('locations/l').deliveryLabel,'Levering fra 39 kr.');assert.equal(f.records.get('locations/l').deliveryFee,39);
  await page.goto(origin+'/admin');await pickup.waitFor();assert.equal(await pickup.inputValue(),'Spar 10% ved afhentning');
  await pickup.fill('');await delivery.fill('');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done');
  await page.goto(origin+'/store');await page.getByRole('dialog').waitFor();assert.equal(await page.locator('[data-delivery-method-label]').count(),0);
});
for(const route of ['/store','/store?generic','/checkout']) test(`configured labels render inside both choices without overflow: ${route}`,async t=>{
  const page=await pageFor(t,320,{pickupLabel:'Spar 25% på alle dine favoritter i dag',deliveryLabel:'Gratislevering'.padEnd(40,'x')});
  await page.goto(origin+route);const panel=page.getByRole('dialog');await panel.waitFor();
  assert.equal(await page.locator('[data-delivery-method-label="pickup"]').innerText(),'Spar 25% på alle dine favoritter i dag');
  assert.equal(await page.locator('[data-delivery-method-label="delivery"]').innerText(),'Gratislevering'.padEnd(40,'x'));
  assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  for(const badge of await page.locator('[data-delivery-method-label]').all())assert.equal(await badge.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  assert.equal(await page.locator('[data-delivery-method-label="delivery"]').evaluate(el=>getComputedStyle(el).color),'rgb(28, 23, 18)');
  if(route==='/store'){await page.getByRole('button',{name:/Jeg tager med/}).click();assert.equal(await page.evaluate(()=>window.selectedMode),'pickup');assert.match(await page.evaluate(()=>window.selectedHref),/deliveryMethod=pickup/);}
});
test('disabled delivery hides its promotional label and remains disabled',async t=>{
  const page=await pageFor(t,390,{deliveryTypes:['pickup']});await page.goto(origin+'/store');await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('[data-delivery-method-label="delivery"]').count(),0);assert.equal(await page.getByRole('button',{name:/Leverer til mig/}).isDisabled(),true);
  assert.equal(await page.locator('[data-delivery-method-label="pickup"]').innerText(),'Spar 25%');
});
test('Esmeralda sheet highlights and focuses "Jeg tager med" by default',async t=>{
  const page=await pageFor(t,390,{});await page.goto(origin+'/store');await page.getByRole('dialog').waitFor();
  const pickup=page.getByRole('button',{name:/Jeg tager med/}),delivery=page.getByRole('button',{name:/Leverer til mig/});
  assert.equal(await pickup.getAttribute('data-preferred'),'true');assert.equal(await delivery.getAttribute('data-preferred'),null);
  await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-preferred'));
  assert.notEqual(await pickup.evaluate(el=>getComputedStyle(el).boxShadow),'none');
  await delivery.click();assert.equal(await page.evaluate(()=>window.selectedMode),'delivery');
});
test('a disabled pickup is never highlighted',async t=>{
  const page=await pageFor(t,390,{deliveryTypes:['delivery']});await page.goto(origin+'/store');await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('[data-preferred]').count(),0);assert.equal(await page.getByRole('button',{name:/Jeg tager med/}).isDisabled(),true);
});
