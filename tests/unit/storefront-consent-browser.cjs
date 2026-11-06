// Real SSR, hydration and consent handlers; loopback-only responses never write production data.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const ts=require('typescript'),React=require('react'),{renderToString}=require('react-dom/server');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
const texts={...loadTs('src/lib/cookie-texts.ts').defaultTexts,customize_button:'Tilpas indstillinger'};
const {shouldShowCookieBanner}=loadTs('src/lib/cookie-banner-state.ts');
const brand={id:'b',slug:'esmeralda',name:'Esmeralda Pizza',logoUrl:'https://i.postimg.cc/unused.png'};
function loadComponent(filename,cache=new Map()) {
  filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
  const mod={exports:{}};cache.set(filename,mod);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(name==='next/navigation')return {usePathname:()=>'/esmeralda/amager'};
    if(name==='next/image')return {__esModule:true,default:({fill,priority,unoptimized,...props})=>React.createElement('img',props)};
    const local=name.startsWith('@/')?path.join(root,'src',name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(filename),name):null;
    if(local){const target=['', '.ts','.tsx','.json'].map(ext=>local+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(target?.endsWith('.json'))return require(target);if(target)return loadComponent(target,cache);}
    return require(name);
  },mod,mod.exports);return mod.exports;
}
function file(name,code){const p=path.join(dir,name+'.js');fs.writeFileSync(p,code);return p;}
before(async()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'storefront-consent-browser-'));
  const {CookieConsent}=loadComponent('src/components/cookie-consent.tsx');
  const {StorefrontBrandLogo}=loadComponent('src/components/layout/storefront-brand-logo.tsx');
  const entry=file('entry',`import React,{useState} from'react';import{hydrateRoot}from'react-dom/client';import{CookieConsent}from'@/components/cookie-consent';import{StorefrontBrandLogo}from'@/components/layout/storefront-brand-logo';
    function App(){const[open,setOpen]=useState(false);const p=window.initialConsentProps;return <><header style={{width:180,height:40}}><StorefrontBrandLogo brand={p.brand} priority/></header><main><h1>Menu</h1><p>Menukortet er klar.</p><button onClick={()=>setOpen(true)}>Cookieindstillinger</button></main><CookieConsent brandId="b" compact initialTexts={p.texts} initialShowBanner={p.show} isModalOpen={open} setIsModalOpen={setOpen}/></>;}
    hydrateRoot(document.getElementById('root'),<App/>);`);
  const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const aliases={
    'next/navigation':file('navigation',`export const usePathname=()=>'/esmeralda/amager';`),
    'next/image':file('image',`import React from'react';export default function Image({fill,priority,unoptimized,...props}){return <img {...props}/>;}`),
    '@':path.join(root,'src'),
  };
  await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js',publicPath:'/'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
  const css=(await require('postcss')([require('tailwindcss')({config:path.join(root,'tailwind.config.ts')})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')})).css;
  server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.endsWith('.js')&&path.basename(url.pathname)===url.pathname.slice(1)&&fs.existsSync(path.join(dir,path.basename(url.pathname)))){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,path.basename(url.pathname))));}
    if(url.pathname==='/style.css'){res.setHeader('content-type','text/css');return res.end(css);}
    if(url.pathname==='/images/esmeralda-v2/logo.png'){res.setHeader('content-type','image/png');return res.end(fs.readFileSync('public/images/esmeralda-v2/logo.png'));}
    if(url.pathname==='/api/consent/save-anonymous'){let raw='';for await(const c of req)raw+=c;const data=JSON.parse(raw);res.setHeader('content-type','application/json');return res.end(JSON.stringify({anon_user_id:data.anon_user_id}));}
    if(url.pathname==='/api/public/cookie-texts'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(texts));}
    const raw=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('orderfly_cookie_consent='));
    let cookie;try{cookie=raw&&decodeURIComponent(raw.slice(raw.indexOf('=')+1));}catch{}
    const props={texts,show:shouldShowCookieBanner(cookie,texts.consent_version),brand:url.searchParams.has('other')?{...brand,slug:'other',logoUrl:'/other-logo.png'}:brand};
    const body=renderToString(React.createElement(React.Fragment,null,
      React.createElement('header',{style:{width:180,height:40}},React.createElement(StorefrontBrandLogo,{brand:props.brand,priority:true})),
      React.createElement('main',null,React.createElement('h1',null,'Menu'),React.createElement('p',null,'Menukortet er klar.'),React.createElement('button',null,'Cookieindstillinger')),
      React.createElement(CookieConsent,{brandId:'b',compact:true,initialTexts:texts,initialShowBanner:props.show,isModalOpen:false,setIsModalOpen:()=>{}})));
    res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root">'+body+'</div><script>window.initialConsentProps='+JSON.stringify(props)+';window.layoutShifts=[];new PerformanceObserver(l=>window.layoutShifts.push(...l.getEntries().filter(e=>!e.hadRecentInput).map(e=>e.value))).observe({type:"layout-shift",buffered:true});</script><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));console.log('Consent screenshots: '+dir);});
async function pageFor(t,options={}){
  const context=await browser.newContext({viewport:{width:390,height:844},...options});t.after(()=>context.close());
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));return {page,context};
}
test('compact banner and local logo are present without JavaScript, with all actions within 30% height',async t=>{
  const {page}=await pageFor(t,{javaScriptEnabled:false});await page.goto(origin);
  const panel=page.locator('[data-cookie-banner]');await panel.waitFor();
  const box=await panel.boundingBox();assert.ok(box.height<=844*.3+1);assert.ok(box.y>=844*.7-1);
  for(const name of ['Afvis valgfrie','Accepter alle','Tilpas indstillinger']){
    const action=await panel.getByRole('button',{name,exact:true}).boundingBox();assert.ok(action.y>=box.y&&action.y+action.height<=845);
  }
  const logo=page.getByRole('img',{name:brand.name});assert.equal(await logo.getAttribute('src'),'/images/esmeralda-v2/logo.png');
  assert.equal(await logo.getAttribute('width'),'425');assert.equal(await logo.getAttribute('height'),'92');
  await page.screenshot({path:path.join(dir,'cookie-first-paint-390.png')});
});
test('no settings chunk is fetched before interaction; hydration adds no layout shift',async t=>{
  const {page}=await pageFor(t);const chunks=[];page.on('request',r=>{if(r.url().includes('cookie-preferences-dialog'))chunks.push(r.url());});
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('[data-cookie-banner]'));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(chunks.length,0);assert.equal(await page.evaluate(()=>window.layoutShifts.reduce((a,b)=>a+b,0)),0);
  await page.getByRole('button',{name:'Tilpas indstillinger',exact:true}).click();
  await page.getByRole('dialog',{name:texts.modal_title,exact:true}).waitFor();assert.ok(chunks.length>0);
  await page.screenshot({path:path.join(dir,'cookie-settings-390.png')});
});
for(const action of ['reject','accept','customize'])test(`explicit ${action} preserves version, categories and persistence`,async t=>{
  const {page}=await pageFor(t);const saves=[];page.on('request',r=>{if(r.url().includes('/api/consent/save-anonymous'))saves.push(r.postDataJSON());});
  await page.goto(origin);assert.equal(saves.length,0);
  if(action==='customize'){
    await page.getByRole('button',{name:'Tilpas indstillinger',exact:true}).click();
    await page.getByRole('switch',{name:texts.categories.statistics.title,exact:true}).click();
    await page.getByRole('button',{name:texts.save_preferences_button,exact:true}).click();
  }else await page.getByRole('button',{name:action==='reject'?'Afvis valgfrie':'Accepter alle',exact:true}).click();
  await page.locator('[data-cookie-banner]').waitFor({state:'hidden'});
  await page.waitForFunction(()=>!!localStorage.getItem('orderfly_cookie_consent'));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly_cookie_consent')));
  assert.deepEqual(saved,{necessary:true,functional:action==='accept',statistics:action!=='reject',marketing:action==='accept',consent_version:texts.consent_version});
  await page.waitForFunction(()=>!localStorage.getItem('pending_cookie_consent'));
  assert.equal(saves.length,1);assert.equal(saves[0].brand_id,'b');assert.equal(saves[0].origin_brand,'b');assert.equal(saves[0].consent_version,texts.consent_version);
  await page.reload();assert.equal(await page.locator('[data-cookie-banner]').count(),0);
  await page.getByRole('button',{name:'Cookieindstillinger',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('switch',{name:texts.categories.statistics.title,exact:true}).getAttribute('aria-checked'),String(action!=='reject'));
});
test('outdated and malformed consent show the banner in server HTML, current version does not',async t=>{
  const {context,page}=await pageFor(t,{javaScriptEnabled:false});
  for(const raw of ['bad-json',JSON.stringify({consent_version:'old'}),JSON.stringify({consent_version:texts.consent_version,statistics:false})]){
    await context.addCookies([{name:'orderfly_cookie_consent',value:encodeURIComponent(raw),url:origin}]);
    await page.goto(origin);assert.equal(await page.locator('[data-cookie-banner]').count(),raw.includes(texts.consent_version)?0:1);
  }
});
test('other brands retain their configured logo',async t=>{
  const {page}=await pageFor(t,{javaScriptEnabled:false});await page.goto(origin+'/?other');
  assert.equal(await page.getByRole('img',{name:brand.name}).getAttribute('src'),'/other-logo.png');
});
test('a blocked localStorage still saves the explicit rejection in the cookie',async t=>{
  const {page}=await pageFor(t);await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};});
  await page.goto(origin);await page.getByRole('button',{name:'Afvis valgfrie',exact:true}).click();
  await page.locator('[data-cookie-banner]').waitFor({state:'hidden'});await page.reload();
  assert.equal(await page.locator('[data-cookie-banner]').count(),0);
});
