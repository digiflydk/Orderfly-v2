const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const {esmeraldaPublicHeaders}=loadTs('src/lib/esmeralda-public-host.ts');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
for(const path of ['/','/nyhedsbrev'])for(const width of [390,1440]) test(`captured consent controls and reload on${path} at ${width}px, all provider requests intercepted`,{timeout:45000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),providers=[],ownRequests=[];
  page.setDefaultTimeout(5000);
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://www.esmeraldapizza.dk') {
    ownRequests.push(url.pathname);
    const entry=payload[url.pathname];
    return route.fulfill(entry?{status:200,headers:{...esmeraldaPublicHeaders(url.pathname),'content-type':entry.type||entry.contentType||(/\.js$/.test(url.pathname)?'application/javascript':/\.css$/.test(url.pathname)?'text/css':'text/html')},body:Buffer.from(entry.data,'base64')}:{status:404,body:''});
   }
   providers.push(url.href);
   return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('https://www.esmeraldapizza.dk'+path);
  assert.equal(ownRequests.filter(p=>p==='/_assets/website-consent.js').length,path==='/'?0:1);
  assert.equal(await page.evaluate(()=>window.__esmeraldaConsent47),true);
  await page.waitForTimeout(100);
  assert.deepEqual(providers,[]);
  await page.locator('[flowappz-cookie-command="reject-all"]').click();
  await page.waitForTimeout(100);
  assert.deepEqual(providers,[]);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('label').filter({has:page.locator('[flowappz-cookie-choice="marketing"]')}).click();
  assert.equal(await page.locator('[flowappz-cookie-choice="marketing"]').isChecked(),true);
  await page.locator('[flowappz-cookie-command="accept-selected"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('script[src^="https://connect.facebook.net"],script[src^="https://omnisnippet1.com"],script[src^="https://www.googletagmanager.com"]').length===4);
  // Marketing alone loads Meta, Omnisend and both GTM containers (GTM owns Google Ads; Consent Mode gates its tags).
  assert.equal(providers.length,4);assert.equal(providers.filter(u=>u.includes('googletagmanager')).length,2);
  if(path==='/nyhedsbrev')assert.equal(await page.locator('[data-newsletter-consent-fallback]').isVisible(),true);else assert.equal(await page.locator('[data-newsletter-consent-fallback]').count(),0);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('label').filter({has:page.locator('[flowappz-cookie-choice="marketing"]')}).click();
  assert.equal(await page.locator('[flowappz-cookie-choice="marketing"]').isChecked(),false);
  await Promise.all([page.waitForEvent('load'),page.locator('[flowappz-cookie-command="accept-selected"]').click()]);
  assert.equal(await page.locator('script[src^="https://connect.facebook.net"],script[src^="https://omnisnippet1.com"]').count(),0);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('[flowappz-cookie-command="accept-all"]').filter({visible:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('script[src^="https://www.googletagmanager.com"]').length===2);
  assert.equal(providers.length,8);// Each document loads each container once: the marketing-only document, then the accept-all one.
  assert.deepEqual(providers.filter(u=>u.includes('googletagmanager')).sort(),['https://www.googletagmanager.com/gtm.js?id=GTM-52G3QF76','https://www.googletagmanager.com/gtm.js?id=GTM-52G3QF76','https://www.googletagmanager.com/gtm.js?id=GTM-PK4J8ZFD','https://www.googletagmanager.com/gtm.js?id=GTM-PK4J8ZFD']);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('[flowappz-cookie-command="accept-all"]').filter({visible:true}).click();
  await page.waitForTimeout(100);assert.equal(providers.length,8);
  assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x.event==='gtm.js').length),1);
 }finally{await browser.close();}
});
