const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');

// Real vendor libraries, but ALL collection requests terminate in this fixture.
// Public IDs select the deployed library configuration; no test events reach vendors.
test('real GA4, GTM and Meta libraries generate sanitized commerce requests', {timeout:180000}, async()=>{
 const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const bundle='const attributionExports={};(function(exports){'+compile('src/lib/analytics-attribution.ts')+'})(attributionExports);const require=()=>attributionExports;const exports={};'+compile('src/lib/brand-tracking-frame.ts')+';window.mount=exports.mountBrandTracking;';
 const origin='https://orderfly.dk';
 const frameHtml=loadTs('src/lib/brand-tracking-frame.ts').BRAND_TRACKING_DOCUMENT;
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const results={};
  for(const mode of ['http','gtm-http']){
   const context=await browser.newContext();const page=await context.newPage();const requests=[],errors=[],libraries=[];


   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')errors.push(msg.text())});
   page.on('requestfailed',r=>errors.push(new URL(r.url()).hostname+': '+r.failure()?.errorText));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin)return route.fulfill({contentType:url.pathname==='/bundle.js'?'application/javascript':'text/html',body:url.pathname==='/bundle.js'?bundle:url.pathname==='/tracking/frame'?frameHtml:'<!doctype html><script src="/bundle.js"></script>'});
    // Allow only library/config JavaScript. Never allow a collect/pixel request out.
    if(req.resourceType()==='script'&&((url.hostname==='www.googletagmanager.com'&&/^\/(gtag\/js|gtag\/destination|gtm\.js)$/.test(url.pathname))||(url.hostname==='connect.facebook.net'&&(/\.js$/.test(url.pathname)||/^\/signals\/config\/(?:\d+|global_config)$/.test(url.pathname))))){libraries.push(url.hostname+url.pathname);return route.continue();}
    requests.push({host:url.hostname,path:url.pathname,event:url.searchParams.get('en')||url.searchParams.get('ev'),body:req.postData(),location:url.searchParams.get('dl'),referrer:url.searchParams.get('rl')||url.searchParams.get('dr'),referrerHost:url.searchParams.get('cd[referrer_host]')});
    return route.fulfill({status:200,body:''});
   });
   await page.goto(origin+'/esmeralda?utm_source=vendor_fixture&fbclid=fixture_click&receipt_token=private_fixture_token',{referer:'https://campaign.example/private_referrer_path?token=private_referrer_token'});
   await page.evaluate(mode=>{window.stop=window.mount({id:'fixture',ga4MeasurementId:'G-551JD0H72K',gtmContainerId:mode==='gtm-http'?'GTM-PK4J8ZFD':undefined,metaPixelId:'1830622624963740'},{statistics:true,marketing:true});},mode);
   await page.waitForTimeout(15000);
   const target=page.frames().find(f=>f!==page.mainFrame());
   await target.evaluate(()=>{
    window.metaPrepared=[];
    window.fbq.getFbeventsModules('SignalsFBEventsSendEventEvent').listen(event=>{
     const payload=window.fbq.getFbeventsModules('signalsFBEventsFillParamList')(event).toPayload().toQueryString();
     window.metaPrepared.push(payload);
     return false; // Observe only; preserve every vendor suppression decision.
    });
   });
   await page.evaluate(mode=>{const event={event:'add_to_cart',pagePath:'/esmeralda/checkout',brandId:'fixture',eventId:'fixture-cart',cartValue:20,currency:'DKK',items:[{item_id:'fixture-product',price:20,quantity:1}]};window.orderflyBrandTracker.emit(event);},mode);
   await page.waitForTimeout(10000);
   const metaState=await target.evaluate(()=>{
    const fbq=window.fbq,instance=fbq.instance,pixel='1830622624963740';
    const engine=new (fbq.getFbeventsModules('SignalsFBEventsBotDetectionEngine'))();
    engine.loadRulesFromConfig(instance.pluginConfig.get(pixel,'botblocking').rules);
    return {queue:fbq.queue.length,prepared:window.metaPrepared,
     botBlocked:instance.optIns.isOptedIn(pixel,'BotBlocking')&&engine.shouldBlockUserAgent(navigator.userAgent)&&fbq.getFbeventsModules('SignalsFBEventsGuardrail').eval('bot_blocking_client_side_block_enabled',pixel)};
   });
   results[mode]={metaState,google:requests.filter(x=>/google-analytics\.com$/.test(x.host)),meta:requests.filter(x=>/facebook\.com$/.test(x.host)),errors,libraries};
   await context.close();
  }
  console.log(JSON.stringify(results));
  for(const mode of ['http','gtm-http']){
   assert.ok(results[mode].google.some(x=>x.event==='page_view'||x.body?.includes('en=page_view')),mode+' must generate initial Google page_view');
   assert.ok(results[mode].google.every(x=>x.referrer==='https://campaign.example/'),'Google must retain the external referring origin including initial page_view');
   assert.ok(results[mode].google.some(x=>x.event==='add_to_cart'||x.body?.includes('en=add_to_cart')),mode+' must generate Google add_to_cart');
   assert.ok([...results[mode].google,...results[mode].meta].filter(x=>x.event==='add_to_cart'||x.event==='AddToCart').every(x=>x.location?.includes('utm_source=vendor_fixture')),mode+' commerce URL must retain campaign parameters');
   assert.doesNotMatch(JSON.stringify([...results[mode].google,...results[mode].meta]),/private_fixture_token|receipt_token|private_referrer|tracking\/frame/,'vendor URL must use sanitized storefront context');
   const prepared=results[mode].metaState.prepared.map(x=>new URLSearchParams(x));
   assert.equal(results[mode].metaState.queue,0,'Meta must process the runtime queue');
   const cart=prepared.find(x=>x.get('ev')==='AddToCart');
   assert.ok(cart,mode+' must reach the real Meta SDK send stage with AddToCart');
   assert.equal(cart.get('rl'),'https://orderfly.dk/');
   assert.equal(cart.get('cd[referrer_host]'),'campaign.example');
   assert.equal(new URL(cart.get('dl')).pathname,'/esmeralda/checkout');
   assert.equal(new URL(cart.get('dl')).searchParams.get('utm_source'),'vendor_fixture');
   assert.doesNotMatch(JSON.stringify(results[mode].metaState.prepared),/private_fixture_token|receipt_token|private_referrer|tracking\/frame/);
   if(results[mode].metaState.botBlocked){
    // Meta's current public configuration explicitly suppresses HeadlessChrome.
    // Verify that exact reason; never spoof the browser or disable vendor protection.
    assert.equal(cart.get('bfs[b]'),'1','SDK must mark the event as bot traffic');
    assert.equal(results[mode].meta.length,0,'bot-blocked events must not leave the SDK');
   }else{
    assert.ok(results[mode].meta.some(x=>x.event==='AddToCart'||x.body?.includes('ev=AddToCart')),mode+' must generate Meta AddToCart when vendor permits this browser');
   }
  }
 }finally{await browser.close();}
});
