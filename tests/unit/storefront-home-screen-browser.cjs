const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {chromium} = require('@playwright/test');
const {BasicMeta,AppleWebAppMeta} = require('next/dist/lib/metadata/generate/basic');
const {IconsMetadata} = require('next/dist/lib/metadata/generate/icons');
const {fixture,brand,resolvedMetadata} = require('../helpers/storefront-home-screen-fixture.cjs');
let server,browser,origin,stored;
before(async()=>{
 const png=await sharp({create:{width:100,height:60,channels:4,background:'#de1322'}}).png().toBuffer();
 stored={...brand,logoUrl:'data:image/png;base64,'+png.toString('base64')};
 server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');const host=req.headers['x-forwarded-host']||'esmeralda.orderfly.dk';
   const f=fixture({host,stored});let response;
   const api=url.pathname.match(/^\/api\/storefront\/brands\/([^/]+)\/(manifest\.webmanifest|icon\/(\d+))$/);
   if(api){const request=new Request(url,{headers:{host,'x-forwarded-host':host}});const context={params:Promise.resolve({brandSlug:api[1],size:api[3]})};response=await (api[3]?f.icon(request,context):f.manifest(request,context));}
   else {
    const context={params:Promise.resolve({brandSlug:'esmeralda'})};
    // /esmeralda is a static page that wraps BrandLayout as a component. It
    // needs its own metadata hook; it does not inherit that layout's exports.
    const isStaticEntry=url.pathname==='/'||url.pathname==='/esmeralda';
    const routeMetadata=isStaticEntry?await f.esmeraldaMetadata?.():await f.metadata(context);
    const meta=await resolvedMetadata(routeMetadata,url.pathname.endsWith('/club')?await f.clubMetadata(context):undefined);
    const head=renderToStaticMarkup(React.createElement(React.Fragment,null,...BasicMeta({metadata:meta}),...AppleWebAppMeta({appleWebApp:meta.appleWebApp}),...IconsMetadata({icons:meta.icons})));
    response=new Response(`<!doctype html><html lang="da"><head>${head}</head><body>Storefront metadata regression</body></html>`,{headers:{'content-type':'text/html'}});
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.statusCode=500;res.end(String(error.stack));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
for(const [host,path,base] of [['esmeralda.orderfly.dk','/','/'],['esmeralda.orderfly.dk','/amager','/'],['esmeralda2.orderfly.dk','/','/'],['esmeralda2.orderfly.dk','/amager','/'],['orderfly.dk','/esmeralda','/esmeralda'],['orderfly.dk','/esmeralda/amager','/esmeralda']])test(`mobile browser sees brand install identity at ${host}${path}`,async t=>{
 const context=await browser.newContext({viewport:{width:390,height:844},extraHTTPHeaders:{'x-forwarded-host':host}});t.after(()=>context.close());
 const page=await context.newPage();const response=await page.goto(origin+path);assert.equal(response.status(),200);
 assert.equal(await page.title(),brand.name);
 assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),brand.name);
 const manifestUrl=await page.locator('link[rel="manifest"]').getAttribute('href');
 const manifestResponse=await context.request.get(origin+manifestUrl);assert.equal(manifestResponse.status(),200);
 const manifest=await manifestResponse.json();assert.equal(manifest.name,brand.name);assert.equal(manifest.short_name,brand.name);assert.equal(manifest.start_url,base);assert.equal(manifest.scope,base);
 assert.equal(await page.locator('link[rel="icon"]').count(),1);
 for(const selector of ['link[rel="apple-touch-icon"]','link[rel="icon"]']) {
  const iconUrl=await page.locator(selector).getAttribute('href');assert.match(iconUrl,/\/api\/storefront\/brands\/esmeralda\/icon\//);
  const iconResponse=await context.request.get(origin+iconUrl);assert.equal(iconResponse.status(),200);assert.match(iconResponse.headers()['content-type'],/image\/png/);
  const decoded=await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};},iconUrl);
  const expected=selector.includes('apple')?180:192;assert.deepEqual(decoded,{width:expected,height:expected});
 }
});
test('Club keeps its own Apple identity and manifest in the browser',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.goto(origin+'/club');
 assert.equal(await page.title(),'Esmeralda Club');
 assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),'Esmeralda Club');
 assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/club/manifest.webmanifest');
 assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'/club/ikon/180');
});
