const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const {esmeraldaPublicHeaders}=loadTs('src/lib/esmeralda-public-host.ts');
const {WEBSITE_NOT_FOUND_HTML}=loadTs('src/lib/website-not-found.ts');
const variants=require('../../preview/esmeralda/variants.json').routes;
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const ORIGIN='https://www.esmeraldapizza.dk';
const type=p=>/\.js$/.test(p)?'application/javascript':/\.css$/.test(p)?'text/css':/\.avif$/.test(p)?'image/avif':/\.webp$/.test(p)?'image/webp':/\.png$/.test(p)?'image/png':/\.jpe?g$/.test(p)?'image/jpeg':/\.svg$/.test(p)?'image/svg+xml':/\.woff2?$/.test(p)?'font/woff2':/\.ttf$/.test(p)?'font/ttf':'text/html';
async function open(t,width,path){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage(),csp=[],own=[];
 page.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))csp.push(m.text())});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==ORIGIN)return route.fulfill({status:200,contentType:'application/javascript',body:''});
  own.push(url.pathname);
  const entry=payload[url.pathname],variant=variants[url.pathname];
  const headers={...esmeraldaPublicHeaders(url.pathname)};
  if(entry)return route.fulfill({status:200,headers:{...headers,'content-type':type(entry.file)},body:Buffer.from(entry.data,'base64')});
  if(variant)return route.fulfill({status:200,headers:{...headers,'content-type':'image/avif'},body:fs.readFileSync(`preview/esmeralda/variants/${url.pathname.slice(9)}`)});
  return route.fulfill({status:404,headers:{...headers,'content-type':'text/html; charset=utf-8'},body:WEBSITE_NOT_FOUND_HTML});
 });
 await page.goto(ORIGIN+path,{waitUntil:'load'});await page.waitForTimeout(600);
 return {page,csp,own};
}
for(const width of [320,390])test(`/menu fits the phone screen; the category filter scrolls inside it (${width}px)`,{timeout:60000},async t=>{
 const {page,csp}=await open(t,width,'/menu');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page scroll');
 const filter=await page.locator('#wf-form-Dish-category .collection-list-wrapper').evaluate(e=>({scrollable:e.scrollWidth>e.clientWidth+1,overflow:getComputedStyle(e).overflowX,right:e.getBoundingClientRect().right}));
 assert.equal(filter.overflow,'auto');assert.ok(filter.scrollable,'categories remain reachable by scrolling');assert.ok(filter.right<=width+1);
 // A category at the end of the row can be reached and chosen.
 const last=page.locator('#wf-form-Dish-category .collection-item-4').last();await last.scrollIntoViewIfNeeded();assert.ok(await last.isVisible());
 assert.deepEqual(csp,[]);
});
test('phones load the small dish image variant and never the full-size source',{timeout:60000},async t=>{
 const {page,own}=await open(t,390,'/menu');
 await page.evaluate(async()=>{for(let y=0;y<4000;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,80));}});await page.waitForTimeout(500);
 const loaded=await page.evaluate(()=>[...document.querySelectorAll('img[data-es-variant="1"]')].filter(i=>i.currentSrc).map(i=>({current:new URL(i.currentSrc).pathname,src:i.getAttribute('src')})));
 assert.ok(loaded.length>=5,'several dish images loaded');
 for(const img of loaded){assert.ok(Object.hasOwn(variants,img.current),img.current);assert.equal(variants[img.current].source,img.src);assert.ok(!own.includes(img.src),'full-size source not requested: '+img.src);}
});
test('/kontakt offers direct phone and e-mail actions instead of a form that cannot be sent',{timeout:60000},async t=>{
 const {page,csp}=await open(t,390,'/kontakt');
 const section=page.locator('#kontaktformular');
 await section.getByRole('link',{name:'Ring 32 50 50 40'}).waitFor();
 assert.equal(await section.getByRole('link',{name:'Ring 32 50 50 40'}).getAttribute('href'),'tel:+4532505040');
 assert.equal(await section.getByRole('link',{name:'Skriv til info@esmeraldapizza.dk'}).getAttribute('href'),'mailto:info@esmeraldapizza.dk');
 assert.equal(await section.locator('form, input, textarea').count(),0);
 assert.ok(!(await page.content()).includes('Kontaktformularen er ikke tilgængelig'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(csp,[]);
});
for(const width of [390,1280])test(`unknown addresses show a branded page with ways back (${width}px)`,{timeout:60000},async t=>{
 const {page,csp}=await open(t,width,'/findes-ikke');
 await page.getByRole('heading',{name:'Siden findes ikke',level:1}).waitFor();
 for(const name of ['Se menukortet','Book bord','Forside','Kontakt'])assert.ok(await page.getByRole('link',{name,exact:true}).isVisible(),name);
 assert.ok(await page.getByRole('img',{name:'Esmeralda Pizza & Restaurant'}).evaluate(i=>i.complete&&i.naturalWidth>0),'logo loads under the site CSP');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(csp,[]);
});
