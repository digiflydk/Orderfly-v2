const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {loadTs}=require('../helpers/load-ts.cjs');
const {insertWebsiteReviews}=loadTs('src/lib/website-reviews-section.ts');
test('browser carousel: desktop/mobile, safe rendering, reload and empty feed',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const reviews=Array.from({length:7},(_,i)=>({id:String(i),displayName:'Guest '+i,comment:'<img src=x onerror=alert(1)>',rating:5,receivedAt:'2026-10-01T12:00:00Z',source:'esmeralda'}));
 await context.route('https://reviews.test/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.json')?'application/json':'text/html; charset=utf-8',body:path.endsWith('.js')?fs.readFileSync('preview/esmeralda/adapters/website-reviews.js','utf8'):path.endsWith('.json')?JSON.stringify({reviews}):insertWebsiteReviews('<!doctype html><html><head><style>p{color:#fff}</style></head><body><section><div aria-labelledby="es-club-how-heading">Vi anbefaler</div></section></body></html>')});});
 const page=await context.newPage();await page.goto('https://reviews.test/');await page.locator('.es-review-card').first().waitFor();assert.equal(await page.locator('.es-review-card').count(),3);assert.equal(await page.locator('.es-review-avatar img').count(),0);
 assert.equal(await page.locator('.es-review-text').first().evaluate(e=>getComputedStyle(e).color),'rgb(17, 17, 17)');
 await page.getByLabel('Om anmeldelsens kilde').first().click();assert.match(await page.locator('.es-review-info[open]').innerText(),/Esmeraldas feedbacksystem/);await page.getByLabel('Om anmeldelsens kilde').first().press('Escape');assert.equal(await page.locator('.es-review-info[open]').count(),0);
 const initial=await page.locator('.es-review-who h3').allTextContents();await page.reload();await page.locator('.es-review-card').first().waitFor();const second=await page.locator('.es-review-who h3').allTextContents();assert.equal(new Set([...initial,...second]).size,6);
 await page.getByRole('button',{name:'Næste anmeldelser'}).click();assert.equal(await page.locator('.es-review-card').count(),1);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Næste anmeldelser'}).click();assert.equal(await page.locator('.es-review-card').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const beforeRotation=await page.locator('.es-review-who h3').allTextContents();
 await page.locator('#es-customer-reviews').hover();
 await page.waitForTimeout(4500);
 assert.notDeepEqual(await page.locator('.es-review-who h3').allTextContents(),beforeRotation,'rotation continues with pointer over section and Next button focused');
 reviews.length=0;await page.reload();assert.equal(await page.locator('#es-customer-reviews').isVisible(),false);
 await context.close();
 }finally{await browser.close();}
});

test('touch mobile with reduced motion rotates on arrival and after closing source details',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const reviews=Array.from({length:5},(_,i)=>({id:String(i),displayName:'Mobile '+i,comment:'Dansk anmeldelse',rating:5,source:'esmeralda'}));
 await context.route('https://reviews.test/**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.json')?'application/json':'text/html',body:p.endsWith('.js')?fs.readFileSync('preview/esmeralda/adapters/website-reviews.js','utf8'):p.endsWith('.json')?JSON.stringify({reviews}):insertWebsiteReviews('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><section aria-labelledby="es-club-how-heading"></section></body></html>')});});
 const page=await context.newPage();await page.goto('https://reviews.test/');const name=page.locator('.es-review-who h3');await name.waitFor();
 const first=await name.textContent();await page.waitForTimeout(4500);assert.notEqual(await name.textContent(),first);
 const badge=page.getByLabel('Om anmeldelsens kilde');await badge.tap();const opened=await name.textContent();await page.waitForTimeout(4500);assert.equal(await name.textContent(),opened);
 await badge.tap();await page.waitForTimeout(4500);assert.notEqual(await name.textContent(),opened,'touch focus on closed badge must not stop autoplay');
 await context.close();
 }finally{await browser.close();}
});
