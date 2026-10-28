const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const {esmeraldaPublicHeaders}=loadTs('src/lib/esmeralda-public-host.ts');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
for(const width of [390,1440]) test(`captured consent controls and reload at ${width}px, all provider requests intercepted`,{timeout:45000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),providers=[];
  page.setDefaultTimeout(5000);
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://www.esmeraldapizza.dk') {
    const entry=payload[url.pathname];
    return route.fulfill(entry?{status:200,headers:{...esmeraldaPublicHeaders(url.pathname),'content-type':entry.type||entry.contentType||(/\.js$/.test(url.pathname)?'application/javascript':/\.css$/.test(url.pathname)?'text/css':'text/html')},body:Buffer.from(entry.data,'base64')}:{status:404,body:''});
   }
   providers.push(url.href);
   return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  await page.goto('https://www.esmeraldapizza.dk/nyhedsbrev');
  await page.waitForTimeout(100);
  assert.deepEqual(providers,[]);
  await page.locator('[flowappz-cookie-command="reject-all"]').click();
  await page.waitForTimeout(100);
  assert.deepEqual(providers,[]);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('label').filter({has:page.locator('[flowappz-cookie-choice="marketing"]')}).click();
  assert.equal(await page.locator('[flowappz-cookie-choice="marketing"]').isChecked(),true);
  await page.locator('[flowappz-cookie-command="accept-selected"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('script[src^="https://connect.facebook.net"],script[src^="https://omnisnippet1.com"]').length===2);
  assert.equal(providers.length,2);assert.ok(!providers.some(u=>u.includes('googletagmanager')));
  assert.equal(await page.locator('[data-newsletter-consent-fallback]').isVisible(),true);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('label').filter({has:page.locator('[flowappz-cookie-choice="marketing"]')}).click();
  assert.equal(await page.locator('[flowappz-cookie-choice="marketing"]').isChecked(),false);
  await Promise.all([page.waitForEvent('load'),page.locator('[flowappz-cookie-command="accept-selected"]').click()]);
  assert.equal(await page.locator('script[src^="https://connect.facebook.net"],script[src^="https://omnisnippet1.com"]').count(),0);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('[flowappz-cookie-command="accept-all"]').filter({visible:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('script[src^="https://www.googletagmanager.com"]').length===1);
  assert.equal(providers.length,5);
  await page.locator('[flowappz-cookie-consent-sticky-cookie-button]').click();
  await page.locator('[flowappz-cookie-command="accept-all"]').filter({visible:true}).click();
  await page.waitForTimeout(100);assert.equal(providers.length,5);
  assert.equal(await page.evaluate(()=>window.dataLayer.filter(x=>x.event==='gtm.js').length),1);
 }finally{await browser.close();}
});
