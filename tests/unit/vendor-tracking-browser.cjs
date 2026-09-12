const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),ts=require('typescript');
const {chromium}=require('@playwright/test');

// Real vendor libraries, but ALL collection requests terminate in this fixture.
// Public IDs select the deployed library configuration; no test events reach vendors.
test('real vendor delivery: srcdoc versus HTTP document', {timeout:120000}, async()=>{
 const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const bundle='const attributionExports={};(function(exports){'+compile('src/lib/analytics-attribution.ts')+'})(attributionExports);const require=()=>attributionExports;const exports={};'+compile('src/lib/brand-tracking-frame.ts')+';window.mount=exports.mountBrandTracking;';
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?bundle:'<!doctype html><script src="/bundle.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const results={};
  for(const mode of ['srcdoc','http']){
   const context=await browser.newContext();const page=await context.newPage();const requests=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin)return route.continue();
    // Allow only library/config JavaScript. Never allow a collect/pixel request out.
    if(req.resourceType()==='script'&&((url.hostname==='www.googletagmanager.com'&&/^\/(gtag\/js|gtm\.js)$/.test(url.pathname))||(url.hostname==='connect.facebook.net'&&(/\.js$/.test(url.pathname)||/^\/signals\/config\/\d+$/.test(url.pathname)))))return route.continue();
    requests.push({host:url.hostname,path:url.pathname,event:url.searchParams.get('en')||url.searchParams.get('ev'),body:req.postData()});
    return route.fulfill({status:200,body:''});
   });
   await page.goto(origin+'/esmeralda');
   await page.evaluate(()=>{window.stop=window.mount({id:'fixture',ga4MeasurementId:'G-551JD0H72K',metaPixelId:'1830622624963740'},{statistics:true,marketing:true});});
   if(mode==='http'){
    const html=await page.locator('iframe').getAttribute('srcdoc');
    await page.route(origin+'/frame',route=>route.fulfill({contentType:'text/html',body:html}));
    await page.evaluate(()=>{const f=document.querySelector('iframe');f.removeAttribute('srcdoc');f.src='/frame';});
   }
   await page.waitForTimeout(15000);
   await page.evaluate(()=>window.orderflyBrandTracker.emit({event:'add_to_cart',brandId:'fixture',eventId:'fixture-cart',cartValue:20,currency:'DKK',items:[{item_id:'fixture-product',price:20,quantity:1}]}));
   await page.waitForTimeout(10000);
   results[mode]={google:requests.filter(x=>/google-analytics\.com$/.test(x.host)),meta:requests.filter(x=>/facebook\.com$/.test(x.host)&&x.path==='/tr/'),errors};
   await context.close();
  }
  console.log(JSON.stringify(results));
  assert.ok(results.http.google.length,'HTTP document must generate Google collect requests');
  assert.ok(results.http.meta.length,'HTTP document must generate Meta pixel requests');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
