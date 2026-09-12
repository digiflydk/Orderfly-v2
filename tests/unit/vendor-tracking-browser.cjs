const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),ts=require('typescript');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');

// Real vendor libraries, but ALL collection requests terminate in this fixture.
// Public IDs select the deployed library configuration; no test events reach vendors.
test('real vendor delivery: srcdoc versus HTTP document', {timeout:150000}, async()=>{
 const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const bundle='const attributionExports={};(function(exports){'+compile('src/lib/analytics-attribution.ts')+'})(attributionExports);const require=()=>attributionExports;const exports={};'+compile('src/lib/brand-tracking-frame.ts')+';window.mount=exports.mountBrandTracking;';
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle:'<!doctype html><script src="/bundle.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='https://orderfly.dk';
 const frameHtml=loadTs('src/lib/brand-tracking-frame.ts').BRAND_TRACKING_DOCUMENT;
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const results={};
  for(const mode of ['srcdoc','http','gtm-http']){
   const context=await browser.newContext();const page=await context.newPage();const requests=[],errors=[],libraries=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')errors.push(msg.text())});
   page.on('requestfailed',r=>errors.push(new URL(r.url()).hostname+': '+r.failure()?.errorText));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin)return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:url.pathname==='/tracking/frame'?frameHtml:'<!doctype html><script src="/bundle.js"></script>'});
    // Allow only library/config JavaScript. Never allow a collect/pixel request out.
    if(req.resourceType()==='script'&&((url.hostname==='www.googletagmanager.com'&&/^\/(gtag\/js|gtag\/destination|gtm\.js)$/.test(url.pathname))||(url.hostname==='connect.facebook.net'&&(/\.js$/.test(url.pathname)||/^\/signals\/config\/\d+$/.test(url.pathname))))){libraries.push(url.hostname+url.pathname);return route.continue();}
    requests.push({host:url.hostname,path:url.pathname,event:url.searchParams.get('en')||url.searchParams.get('ev'),body:req.postData()});
    return route.fulfill({status:200,body:''});
   });
   await page.goto(origin+'/esmeralda');
   await page.evaluate(mode=>{window.stop=window.mount({id:'fixture',ga4MeasurementId:'G-551JD0H72K',gtmContainerId:mode==='gtm-http'?'GTM-PK4J8ZFD':undefined,metaPixelId:'1830622624963740'},{statistics:true,marketing:true});},mode);
   if(mode==='srcdoc'){
    await page.evaluate(html=>{const f=document.querySelector('iframe');f.removeAttribute('src');f.srcdoc=html;},frameHtml);
   }
   await page.waitForTimeout(15000);
   await page.evaluate(()=>window.orderflyBrandTracker.emit({event:'add_to_cart',brandId:'fixture',eventId:'fixture-cart',cartValue:20,currency:'DKK',items:[{item_id:'fixture-product',price:20,quantity:1}]}));
   await page.waitForTimeout(10000);
   results[mode]={google:requests.filter(x=>/google-analytics\.com$/.test(x.host)),meta:requests.filter(x=>/facebook\.com$/.test(x.host)&&x.path==='/tr/'),errors,libraries,other:requests.filter(x=>!/google-analytics|facebook/.test(x.host))};
   await context.close();
  }
  console.log(JSON.stringify(results));
  for(const mode of ['http','gtm-http']){
   assert.ok(results[mode].google.some(x=>x.event==='add_to_cart'||x.body?.includes('en=add_to_cart')),mode+' must generate Google add_to_cart');
   assert.ok(results[mode].meta.some(x=>x.event==='AddToCart'||x.body?.includes('ev=AddToCart')),mode+' must generate Meta AddToCart');
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
