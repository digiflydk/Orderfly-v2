// The delivery sheet stays open with "Henter menuen…" until the menu route has rendered, so customers
// never face a closed sheet and an unchanged page. Real components; the route render is a suspending fixture.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
function fixture(name,code){const file=path.join(dir,name+'.js');fs.writeFileSync(file,code);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'delivery-sheet-loading-'));
 // router.push updates the route inside the caller's transition; the new route suspends while the "server" renders it.
 const navigation=fixture('navigation',`export const useRouter=()=>({push:href=>{window.fixturePushes.push(href);window.fixtureNavigate(href);},prefetch:(href,options)=>{window.fixturePrefetches.push([href,options?.kind]);}});
 export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({});`);
 const entry=fixture('entry',`import React,{Suspense,useState} from 'react';import{createRoot}from'react-dom/client';
 import DeliveryMethodModal,{openDeliveryModal} from '@/components/modals/DeliveryMethodModal';
 window.fixturePushes=[];window.fixturePrefetches=[];const pending=new Map(),done=new Set();
 const load=href=>{if(done.has(href))return;if(!pending.has(href))pending.set(href,new Promise(r=>setTimeout(r,1200)).then(()=>done.add(href)));throw pending.get(href);};
 function Route({href}){if(href)load(href);return <main id="route">{href||'landing'}</main>;}
 function App(){const [href,setHref]=useState(null);window.fixtureNavigate=setHref;
  const location={id:'l',slug:'amager',name:'Amager',deliveryTypes:['pickup','delivery'],openingHours:{}};
  return <><button id="card" onClick={()=>openDeliveryModal({brandSlug:new URLSearchParams(window.location.search).get('brand')||'esmeralda',locationSlug:'amager',location})}>Bestil her</button>
   <Suspense fallback={<p id="fallback">fallback</p>}><Route href={href}/></Suspense><DeliveryMethodModal/></>;}
 createRoot(document.getElementById('root')).render(<App/>);`);
 const loader=fixture('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  'next/navigation':navigation,
  'next/dynamic':fixture('dynamic',`import React,{lazy,Suspense} from 'react';export default function dynamic(load){const C=lazy(load);return props=><Suspense fallback={null}><C {...props}/></Suspense>;}`),
  '@/context/cart-context':fixture('cart',`export const useCart=()=>({location:null,setDeliveryType:type=>{window.fixtureType=type;}});`),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js',publicPath:'/'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/delivery-sheet-loading-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const postcss=require('postcss'),tailwind=require('tailwindcss');const {loadTs}=require('../helpers/load-ts.cjs');
 const css=(await postcss([tailwind({...loadTs('tailwind.config.ts',{'tailwindcss-animate':{default:require('tailwindcss-animate')}}).default,content:[path.join(root,'src/components/**/*.{ts,tsx}')]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:undefined})).css;
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('.js')){const file=path.join(dir,path.basename(url.pathname));if(fs.existsSync(file)){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}}
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();server?.close();if(dir)fs.rmSync(dir,{recursive:true,force:true});});

for(const width of [390,1280]) test(`Esmeralda sheet shows loading until the menu renders, ignores repeat taps (${width}px)`,async()=>{
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/');await page.click('#card');
 const sheet=page.locator('[data-commerce-panel="delivery"]');await sheet.waitFor();
 // Both menus are requested while the customer decides, each under its own address (prices differ per method).
 assert.deepEqual(await page.evaluate(()=>window.fixturePrefetches),[['/esmeralda/amager?deliveryMethod=pickup','full'],['/esmeralda/amager?deliveryMethod=delivery','full']]);
 const pickup=sheet.getByRole('button',{name:/Jeg tager med/});const delivery=sheet.getByRole('button',{name:/Leverer til mig/});
 const started=Date.now();await pickup.click();
 // Immediately: sheet still open, chosen option busy with a visible status, both options locked.
 await sheet.getByRole('status').filter({hasText:'Henter menuen…'}).waitFor({timeout:300});
 assert.equal(await pickup.getAttribute('aria-busy'),'true');assert.ok(await pickup.isDisabled());assert.ok(await delivery.isDisabled());
 assert.ok(await sheet.getByRole('status').isVisible());
 if(process.env.SHEET_SCREENSHOT&&width===390)await page.screenshot({path:process.env.SHEET_SCREENSHOT});
 await delivery.click({force:true});await page.keyboard.press('Escape');
 await page.waitForTimeout(400);assert.ok(await sheet.isVisible(),'sheet stays while the menu loads');
 // The other option is visibly locked (after its fade); the chosen one stays fully visible.
 assert.equal(await delivery.evaluate(el=>getComputedStyle(el).opacity),'0.4');assert.equal(await pickup.evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.equal(await page.locator('#route').textContent(),'landing');
 // Closes exactly when the new route is shown; one navigation only.
 await page.locator('#route',{hasText:'/esmeralda/amager?deliveryMethod=pickup'}).waitFor();
 await sheet.waitFor({state:'detached',timeout:2000});
 assert.ok(Date.now()-started>=1100,'closed only after the route rendered');
 assert.deepEqual(await page.evaluate(()=>window.fixturePushes),['/esmeralda/amager?deliveryMethod=pickup']);
 assert.equal(await page.evaluate(()=>window.fixtureType),'pickup');
 assert.equal(await page.locator('#fallback').count(),0,'the previous page stays instead of a fallback');
 assert.deepEqual(errors,[]);await page.close();
});
test('generic sheet of other brands shows the same loading state',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(origin+'/?brand=cph-qa');await page.click('#card');
 const sheet=page.locator('[data-commerce-panel="delivery"]');await sheet.waitFor();
 await sheet.getByRole('button',{name:/Levering/}).click();
 await sheet.getByText('Henter menuen…').waitFor({timeout:300});
 assert.ok(await sheet.getByRole('button',{name:/Afhentning/}).isDisabled());
 await page.locator('#route',{hasText:'/cph-qa/amager?deliveryMethod=delivery'}).waitFor();
 await sheet.waitFor({state:'detached',timeout:2000});
 assert.deepEqual(await page.evaluate(()=>window.fixturePushes),['/cph-qa/amager?deliveryMethod=delivery']);await page.close();
});
