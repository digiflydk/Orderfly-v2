const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {loadTs}=require('../helpers/load-ts.cjs');
const {insertWebsiteReviews}=loadTs('src/lib/website-reviews-section.ts');
test('browser carousel: desktop/mobile, safe rendering, reload and empty feed',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const reviews=Array.from({length:7},(_,i)=>({id:String(i),displayName:'Guest '+i,comment:'<img src=x onerror=alert(1)>',rating:5,receivedAt:'2026-10-01T12:00:00Z',source:'esmeralda'}));
 await context.route('https://reviews.test/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.json')?'application/json':'text/html; charset=utf-8',body:path.endsWith('.js')?fs.readFileSync('preview/esmeralda/adapters/website-reviews.js','utf8'):path.endsWith('.json')?JSON.stringify({reviews}):insertWebsiteReviews('<!doctype html><html><body><section><div class="homepage-recommendation-header">Vi anbefaler</div></section></body></html>')});});
 const page=await context.newPage();await page.goto('https://reviews.test/');await page.locator('.es-review-card').first().waitFor();assert.equal(await page.locator('.es-review-card').count(),3);assert.equal(await page.locator('.es-review-card img').count(),0);
 const initial=await page.locator('.es-review-who h3').allTextContents();await page.reload();await page.locator('.es-review-card').first().waitFor();const second=await page.locator('.es-review-who h3').allTextContents();assert.equal(new Set([...initial,...second]).size,6);
 await page.getByRole('button',{name:'Næste anmeldelser'}).click();assert.equal(await page.locator('.es-review-card').count(),1);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Næste anmeldelser'}).click();assert.equal(await page.locator('.es-review-card').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 reviews.length=0;await page.reload();assert.equal(await page.locator('#es-customer-reviews').isVisible(),false);
 await context.close();
 }finally{await browser.close();}
});
