const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),ts=require('typescript');
const {chromium}=require('@playwright/test');

test('brand tracking sends explicit destinations and destroys the previous runtime',async()=>{
 const attributionCode=ts.transpileModule(fs.readFileSync('src/lib/analytics-attribution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const code=ts.transpileModule(fs.readFileSync('src/lib/brand-tracking-frame.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end('const attributionExports={};(function(exports){'+attributionCode+'})(attributionExports);const require=()=>attributionExports;const exports={};'+code+';window.mount=exports.mountBrandTracking;');}res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><script src="/bundle.js"></script></body></html>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route(/https:\/\/(www.googletagmanager.com|connect.facebook.net)\//,r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?utm_source=google&utm_campaign=pizza&gclid=allowed123&receipt_token=private&session_id=private');
  await page.evaluate(()=>{window.stop=window.mount({id:'a',ga4MeasurementId:'G-A',googleAdsConversionId:'AW-A',googleAdsPurchaseLabel:'purchase',metaPixelId:'111'});window.orderflyBrandTracker.emit({event:'purchase',brandId:'a',ecommerce:{transaction_id:'test-1',value:100,currency:'DKK',items:[]}})});
  let frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.dataLayer.some(x=>x[0]==='event'&&x[1]==='purchase'));
  const first=await frame.evaluate(()=>({google:window.dataLayer.map(x=>Array.from(x)),meta:window.fbq.queue.map(x=>Array.from(x))}));
  assert.equal(first.google.find(x=>x[1]==='purchase')[2].send_to,'G-A');
  assert.equal(first.google.find(x=>x[1]==='purchase')[2].campaign_source,'google');
  assert.match(first.google.find(x=>x[1]==='purchase')[2].page_location,/gclid=allowed123/);
  assert.doesNotMatch(JSON.stringify(first),/receipt_token|session_id|private/);
  assert.equal(first.google.find(x=>x[1]==='conversion')[2].send_to,'AW-A/purchase');
  assert.deepEqual(first.meta.find(x=>x[2]==='Purchase').slice(0,3),['trackSingle','111','Purchase']);
  await page.evaluate(()=>{window.stop();window.stop=window.mount({id:'b',gtmContainerId:'GTM-B',metaPixelId:'222'});window.orderflyBrandTracker.emit({event:'purchase',brandId:'a',ecommerce:{transaction_id:'wrong'}});window.orderflyBrandTracker.emit({event:'purchase',brandId:'b',ecommerce:{transaction_id:'test-2',value:200,currency:'DKK',items:[]}})});
  assert.equal(frame.isDetached(),true);
  frame=page.frames().find(f=>f!==page.mainFrame());
  await frame.waitForFunction(()=>window.dataLayer.some(x=>x.event==='purchase'));
  const second=await frame.evaluate(()=>({events:window.dataLayer.filter(x=>x.event==='purchase'),meta:window.fbq.queue.map(x=>Array.from(x))}));
  assert.equal(second.events.length,1);assert.equal(second.events[0].brandId,'b');
  assert.deepEqual(second.meta.find(x=>x[2]==='Purchase').slice(0,3),['trackSingle','222','Purchase']);
  await page.evaluate(()=>window.stop());assert.equal(page.frames().length,1);
  assert.equal(await page.evaluate(()=>window.orderflyBrandTracker),undefined);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
