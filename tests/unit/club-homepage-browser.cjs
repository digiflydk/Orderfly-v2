const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root,'design/esmeralda-club-homepage.html'),'utf8');
const css = fs.readFileSync(path.join(root,'design/esmeralda-club-homepage.css'),'utf8');
const js = fs.readFileSync(path.join(root,'design/esmeralda-club-popup.js'),'utf8');
// Existing approved Webflow utility values, not promotion-specific typography.
const shared = '.heading-style-h1{font-size:38px;line-height:1.1}.heading-style-h2{font-size:42px}.heading-style-h3{font-size:28px;line-height:1.2}.text-size-regular{font-size:16px;line-height:1.5}.padding-global{display:flex;margin:60px 0;padding:0 3.25rem;justify-content:center;align-items:center;text-align:center}.padding-global.padding-section-medium{background:#2a1000}.padding-section-medium{padding-top:4rem;padding-bottom:4rem}.button{padding:14px 40px;font-size:16px;text-align:center}';
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CLUB_QA_CHROMIUM||undefined,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});
async function fixture({consent=null,width=1440,pathName='/',host='www.esmeraldapizza.dk'}={}) {
 const context=await browser.newContext({viewport:{width,height:950}});
 if(consent!==null) await context.addCookies([
  {name:'fa-consent-security_storage',value:'true',domain:host,path:'/'},
  {name:'fa-consent-analytics_storage',value:consent?'true':'false',domain:host,path:'/'}]);
 const page=await context.newPage(); await page.clock.install();
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith('https://'+host+'/')) return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}*{box-sizing:border-box}${shared}${css}</style></head><body><button id="prior">Previous action</button>${html}<div id="cookie" flowappz-cookie-popup style="display:none">Cookies</div><script>${js}</script></body></html>`});
  if(url.endsWith('.webp')) return route.fulfill({contentType:'image/webp',body:fs.readFileSync(path.join(root,'attached_assets/esmeralda-club-hero-20261022.webp'))});
  return route.abort();
 });
 await page.goto('https://'+host+pathName);return {page,context};
}
async function events(page){return page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x)));}
test('no choice: no automatic popup or promotion events',async()=>{
 const {page,context}=await fixture();await page.clock.fastForward(15000);
 assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(await events(page),[]);await context.close();
});
test('rejected statistics: popup still works, no metrics or UTM',async()=>{
 const {page,context}=await fixture({consent:false});await page.clock.fastForward(13000);
 assert.equal(await page.locator('dialog[open]').count(),1);assert.deepEqual(await events(page),[]);
 const navigation=page.waitForRequest(r=>r.isNavigationRequest()&&r.url().includes('orderfly.dk'));
 await page.locator('[data-club-placement="popup"]').click();const request=await navigation;
 assert.equal(request.url(),'https://esmeralda.orderfly.dk/club/tilmeld');await context.close();
});
test('statistics: bounded Google promotion events, never signup or personal data',async()=>{
 const {page,context}=await fixture({consent:true});await page.clock.fastForward(13000);
 const e=await events(page);assert.equal(e.filter(x=>x[1]==='view_promotion').length,2);
 for(const x of e){assert.equal(x[2].send_to,'G-F9XCDW2586');assert.equal(x[2].page_location,'https://www.esmeraldapizza.dk/');assert.deepEqual(Object.keys(x[2]).sort(),['creative_slot','page_location','page_referrer','promotion_id','promotion_name','send_to']);}
 const navigation=page.waitForRequest(r=>r.isNavigationRequest()&&r.url().includes('orderfly.dk'));
 await page.locator('[data-club-placement="popup"]').click();const request=await navigation;
 const url=new URL(request.url());assert.equal(url.searchParams.get('utm_content'),'popup');assert.equal(url.searchParams.get('utm_campaign'),'pizza_club');await context.close();
});
test('cookie panel blocks popup and later resolves without requiring optional consent',async()=>{
 const {page,context}=await fixture({consent:false});await page.locator('#cookie').evaluate(el=>el.style.display='block');
 await page.clock.fastForward(14000);assert.equal(await page.locator('dialog[open]').count(),0);
 await page.locator('#cookie').evaluate(el=>el.style.display='none');await page.clock.fastForward(1000);
 assert.equal(await page.locator('dialog[open]').count(),1);await context.close();
});
test('Escape restores focus and dismissal survives reload of this session',async()=>{
 const {page,context}=await fixture({consent:false});await page.locator('#prior').focus();await page.clock.fastForward(13000);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'prior');await page.reload();await page.clock.fastForward(13000);
 assert.equal(await page.locator('dialog[open]').count(),0);await context.close();
});
test('statistics revocation immediately stops click measurement and strips attribution',async()=>{
 const {page,context}=await fixture({consent:true});await page.clock.fastForward(13000);await page.keyboard.press('Escape');
 await context.addCookies([{name:'fa-consent-analytics_storage',value:'false',domain:'www.esmeraldapizza.dk',path:'/'}]);
 await page.evaluate(()=>document.querySelector('[data-club-placement="hero"]').addEventListener('click',e=>e.preventDefault()));
 const before=(await events(page)).length;await page.locator('[data-club-placement="hero"]').click();
 assert.equal((await events(page)).length,before);assert.equal(await page.locator('[data-club-placement="hero"]').getAttribute('href'),'https://esmeralda.orderfly.dk/club/tilmeld');await context.close();
});
test('not the homepage: no campaign runtime',async()=>{
 const {page,context}=await fixture({consent:true,pathName:'/bordbooking'});await page.clock.fastForward(14000);
 assert.equal(await page.locator('dialog').count(),0);assert.deepEqual(await events(page),[]);await context.close();
});
test('preview host never sends website analytics even with consent',async()=>{
 const {page,context}=await fixture({consent:true,host:'preview.webflow.io'});await page.clock.fastForward(13000);
 assert.equal(await page.locator('dialog[open]').count(),1);assert.deepEqual(await events(page),[]);await context.close();
});
for(const width of [320,390,768,1440]) test(`responsive ${width}: no horizontal overflow; readable popup and controls`,async()=>{
 const {page,context}=await fixture({consent:false,width});await page.clock.fastForward(13000);
 const dim=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,modal:document.querySelector('dialog').getBoundingClientRect().toJSON()}));
 assert.ok(dim.scroll<=dim.width,JSON.stringify(dim));assert.ok(dim.modal.width<=width);assert.ok(dim.modal.left>=0);
 assert.ok(dim.modal.top>=0);assert.equal(await page.getByRole('button',{name:'Luk Club-tilbud'}).isVisible(),true);
 assert.equal(await page.locator('#es-club-heading').evaluate(el=>getComputedStyle(el).fontSize),'38px');
 assert.equal(await page.locator('.es-club-hero__inner').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.notEqual(await page.locator('.es-club-hero__intro').evaluate(el=>getComputedStyle(el).textAlign),'center');
 for(const selector of ['.es-club-hero__intro','.es-club-fineprint','.es-club-popup__text'])
  assert.equal(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontSize),'16px');
 await page.getByRole('button',{name:'Måske senere'}).click();assert.equal(await page.locator('dialog[open]').count(),0);await context.close();
});
