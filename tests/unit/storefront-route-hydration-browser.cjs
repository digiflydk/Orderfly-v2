// Hydration of the storefront brand layout while streamed route content is still pending.
// Production (Next 15.5 + its vendored React 19.2 canary) intermittently threw React #418
// when a returning visitor reloaded the menu: the route children reached the client as a
// lazy RSC reference whose client chunk (the brand error.tsx) had not loaded yet. React
// suspended directly under <Content>, replayed that host element without resetting its
// hydration cursor and reported "server rendered HTML didn't match the client".
// This fixture renders the real BrandLayoutClient on the server and hydrates it in Chromium
// with the same React build, seeds a returning visitor's storage and resolves the route
// content only after hydration has reached it.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const wp=require('next/dist/compiled/webpack/webpack');wp.init();
const root=process.cwd();let dir,server,browser,origin,renderServer;
const brand={id:'b',slug:'esmeralda',name:'Esmeralda Pizza',status:'active'};
function file(name,code){const p=path.join(dir,name+'.js');fs.writeFileSync(p,code);return p;}
function bundle(config){return new Promise((resolve,reject)=>wp.webpack(config).run((e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'route-hydration-'));
 const layout=JSON.stringify(path.join(root,'src/app/[brandSlug]/layout-client.tsx'));
 // `direct` reproduces the previous layout: route content as a direct child of the host element.
 const app=file('app',`import React from'react';import{StorefrontV2Provider}from'@/context/storefront-v2-context';import{BrandLayoutClient}from${layout};
 export function Menu(){return <><header data-storefront-header>Esmeralda Pizza</header><main><button type="button">Tilføj Margherita</button></main></>;}
 const brand=${JSON.stringify(brand)};
 export function App({route,direct}){return <StorefrontV2Provider enabled><div data-commerce-root data-brand-slug="esmeralda" data-storefront-version="2">
  {direct?<div className="flex flex-col min-h-screen"><div className="flex-1 w-full">{route}</div></div>:<BrandLayoutClient brand={brand} cookieBanner={{texts:undefined,show:false}}>{route}</BrandLayoutClient>}
 </div></StorefrontV2Provider>;}`);
 const serverEntry=file('server-entry',`import React from'react';import{renderToString}from'react-dom/server';import{App,Menu}from${JSON.stringify(app)};
 export function render(direct){return renderToString(<App direct={direct} route={<Menu/>}/>);}`);
 const clientEntry=file('client-entry',`import React,{startTransition}from'react';import{hydrateRoot}from'react-dom/client';import{App,Menu}from${JSON.stringify(app)};
 window.recoveries=[];const q=new URLSearchParams(location.search);
 // A lazy node shaped like React's Flight client chunk for a blocked RSC element: a thenable
 // with a status, so React replays the suspended work once it resolves instead of unwinding.
 const listeners=[];const chunk={status:'pending',value:null,then(resolve,reject){if(chunk.status==='fulfilled')resolve(chunk.value);else listeners.push(resolve);}};
 const fulfil=()=>{if(chunk.status==='fulfilled')return;chunk.status='fulfilled';chunk.value=<Menu/>;window.routeResolved=true;listeners.splice(0).forEach(listener=>listener(chunk.value));};
 // The chunk finishes loading right after hydration first reaches it, as a late client chunk does.
 const route={$$typeof:Symbol.for('react.lazy'),_payload:chunk,_init(payload){if(payload.status==='fulfilled')return payload.value;window.routeRequested=true;setTimeout(fulfil,Number(q.get('delay')||0));throw payload;}};
 startTransition(()=>{hydrateRoot(document.getElementById('root'),<App direct={q.has('direct')} route={route}/>,{onRecoverableError:error=>window.recoveries.push(String(error&&error.message))});});
 requestAnimationFrame(function wait(){window.routeResolved?setTimeout(()=>{window.hydrated=true;},300):requestAnimationFrame(wait);});`);
 const stub={
  'next/navigation':file('navigation',`export const usePathname=()=>typeof window==='undefined'?'/esmeralda/amager':window.location.pathname;export const useSearchParams=()=>new URLSearchParams(typeof window==='undefined'?'':window.location.search);export const useRouter=()=>({push(){},replace(){},refresh(){}});`),
  'next/dynamic':file('dynamic',`export default function dynamic(){return function Dynamic(){return null;};}`),
  'next/link':file('link',`import React from'react';export default function Link({prefetch,...props}){return <a {...props}/>;}`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  '@/lib/consent-sync':file('consent-sync','export const saveConsentChoice=async()=>{};export const retryPendingConsent=async()=>{};'),
  '@/app/club-session-actions':file('club-session','export const getClubSessionProfileAction=async()=>({signedIn:false});export const getClubSessionStatusAction=async()=>({signedIn:false});'),
  '@/app/cart-actions':file('cart-actions','export const restoreCartAction=async()=>({items:[],discounts:[]});'),
 };
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 // The same React build as the App Router in production.
 const react=path.dirname(require.resolve('next/dist/compiled/react/package.json')),reactDom=path.dirname(require.resolve('next/dist/compiled/react-dom/package.json'));
 const resolve=target=>({alias:{...stub,'react$':react,'react/jsx-runtime':path.join(react,'jsx-runtime.js'),'react/jsx-dev-runtime':path.join(react,'jsx-dev-runtime.js'),'react-dom$':reactDom,'react-dom/client':path.join(reactDom,'client.js'),'react-dom/server':path.join(reactDom,target==='node'?'server.node.js':'server.browser.js'),'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']});
 const rules=[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/route-hydration-.*\.js$/,use:[loader]}];
 await bundle({mode:'development',devtool:false,target:'node',entry:serverEntry,output:{path:dir,filename:'server.js',library:{type:'commonjs2'}},resolve:resolve('node'),module:{rules}});
 await bundle({mode:'development',devtool:false,entry:clientEntry,output:{path:dir,filename:'client.js'},resolve:resolve('web'),module:{rules}});
 renderServer=require(path.join(dir,'server.js')).render;
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/client.js'){res.setHeader('content-type','text/javascript');return res.end(fs.readFileSync(path.join(dir,'client.js')));}
  if(url.pathname!=='/esmeralda/amager'){res.statusCode=404;return res.end();}
  res.setHeader('content-type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root">'+renderServer(url.searchParams.has('direct'))+'</div><script src="/client.js"></script></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});

// A returning visitor: chosen delivery method, a saved basket, menu view state, consent and location cookies.
async function returningVisitor(width){
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.addCookies([{name:'orderfly_cookie_consent',value:encodeURIComponent(JSON.stringify({necessary:true,functional:false,statistics:false,marketing:false,consent_version:'1.0.59'})),url:origin},{name:'of_location',value:'amager',url:origin}]);
 await context.addInitScript(()=>{try{
  localStorage.setItem('deliveryMethod','pickup');
  localStorage.setItem('orderfly.cart.v1',JSON.stringify({version:1,brandId:'b',locationId:'l',deliveryType:'pickup',includeBagFee:true,choices:[{id:'p0-0',cartItemId:'c1',itemType:'product',quantity:1,toppings:[],offered:false}],savedAt:Date.now()}));
  sessionStorage.setItem('orderfly.menu-view.b.l',JSON.stringify({scroll:0}));
 }catch{}});
 return context;
}
async function load(t,width,query){
 const context=await returningVisitor(width);t.after(()=>context.close());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Load the menu repeatedly in one context, as the observed returning-visitor sequence did.
 const results=[];
 for(const extra of ['','','&x=1']){
  errors.length=0;
  await page.goto(origin+'/esmeralda/amager?deliveryMethod=pickup'+query+extra);
  await page.waitForFunction(()=>window.hydrated===true);
  results.push({errors:[...errors],recoveries:await page.evaluate(()=>window.recoveries),
   menu:await page.getByRole('button',{name:'Tilføj Margherita'}).count(),
   content:await page.locator('[data-commerce-root] .flex-1.w-full [data-storefront-header]').count()});
 }
 return results;
}

for(const width of [390,1280])test(`brand layout hydrates pending route content without #418 for a returning visitor (${width}px)`,async t=>{
 for(const result of await load(t,width,'')){
  assert.deepEqual(result.errors,[],'no pageerror');
  assert.deepEqual(result.recoveries,[],'no recoverable hydration error');
  assert.equal(result.menu,1,'menu content is shown once');
  assert.equal(result.content,1,'route content stays inside the layout content area');
 }
});

test('control: the previous host-element placement reproduces #418 with the same React build',async t=>{
 const results=await load(t,390,'&direct');
 assert.ok(results.some(result=>result.recoveries.some(message=>/Hydration failed because the server rendered HTML didn't match the client/.test(message))),
  'fixture must reproduce the production mismatch: '+JSON.stringify(results.map(r=>r.recoveries)));
});
