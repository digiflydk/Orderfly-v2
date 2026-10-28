const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const manifest=require('../../preview/esmeralda/manifest.json');
const discovery=require('../../preview/esmeralda/production-discovery.json');
const mocks={'../../preview/esmeralda/manifest.json':{default:manifest},'../../preview/esmeralda/production-discovery.json':{default:discovery}};
const lib=loadTs('src/lib/esmeralda-public-host.ts');
const server=loadTs('src/lib/web-design-preview-server.ts',mocks);
const req=(p,method='GET',host='www.esmeraldapizza.dk')=>new Request('https://backend.internal'+p,{method,headers:{host,'x-forwarded-proto':'https'}});
test('new internal mPanel endpoint is reserved from merchant creation',()=>{
 const brand=loadTs('src/lib/brand-subdomain.ts');assert.match(brand.brandSlugError('internal-mpanel-host'),/reserveret/);assert.equal(brand.brandSlugFromHost('internal-mpanel-host.orderfly.dk'),null);
});
test('exact hosts and fixed canonical origin preserve raw query; no suffix/list/port confusion',()=>{
 for(const h of ['esmeraldapizza.dk','www.esmeraldapizza.dk','WWW.ESMERALDAPIZZA.DK:443'])assert.equal(lib.isEsmeraldaPublicHost(h),true);
 for(const h of ['esmeraldapizza.dk.evil','evil.esmeraldapizza.dk','esmeraldapizza.dk:3000','www.esmeraldapizza.dk,evil'])assert.equal(lib.isEsmeraldaPublicHost(h),false);
 for(const q of ['','?','?next=%2Fmenu%3Fx%3D1&x=%252F&a=1&a=2']) {
  assert.equal(lib.esmeraldaCanonicalRedirect(new URL('https://backend/menu'+q),'esmeraldapizza.dk','https'),'https://www.esmeraldapizza.dk/menu'+q);
  assert.equal(lib.esmeraldaCanonicalRedirect(new URL('http://backend/menu'+q),'www.esmeraldapizza.dk','http'),'https://www.esmeraldapizza.dk/menu'+q);
 }
});
test('production release disabled by default and unknown values fail closed',async()=>{
 for(const value of ['', 'false','1','TRUE']) {process.env.ESMERALDA_PUBLIC_ENABLED=value;const r=await server.webDesignPreviewResponse(req('/'));assert.equal(r.status,503);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 delete process.env.ESMERALDA_PUBLIC_ENABLED;
});
test('production discovery preserves reviewed104URLs; public content hashes match combined candidate',async()=>{
 process.env.ESMERALDA_PUBLIC_ENABLED='true';
 try {
  const sitemap=await server.webDesignPreviewResponse(req('/sitemap.xml'));
  assert.equal(sitemap.status,200);assert.equal(sitemap.headers.get('x-robots-tag'),null);
  assert.deepEqual([...((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g))].map(x=>x[1]),discovery.public_urls);
  const robots=await server.webDesignPreviewResponse(req('/robots.txt'));const txt=await robots.text();assert.match(txt,/Allow: \/\n/);assert.doesNotMatch(txt,/Disallow: \/\n/);assert.match(txt,/Disallow: \/mpanel/);
  for(const [p,e]of Object.entries(manifest.routes)) {
   if(p==='/robots.txt'||p==='/book-bord')continue;
   const r=await server.webDesignPreviewResponse(req(p+'?path=/api/health'));assert.equal(r.status,200,p);assert.equal(r.headers.get('x-robots-tag'),null,p);
   assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),e.sha256,p);
  }
  for(const p of ['/sitemap.xml','/robots.txt','/'])assert.equal(await(await server.webDesignPreviewResponse(req(p,'HEAD'))).text(),'');
  assert.equal((await server.webDesignPreviewResponse(req('/book-bord?a=%2F'))).headers.get('location'),'/bordbooking?a=%2F');
 }finally{delete process.env.ESMERALDA_PUBLIC_ENABLED;}
});
test('public APIs, admin, unknown and unsafe methods remain closed; preview discovery unchanged',async()=>{
 process.env.ESMERALDA_PUBLIC_ENABLED='true';
 try {
  for(const p of ['/api/health','/api/checkout','/_next/image','/missing','/index.html']) {const r=await server.webDesignPreviewResponse(req(p));assert.equal(r.status,404,p);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
  for(const m of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal((await server.webDesignPreviewResponse(req('/',m))).status,405);
  const preview=await server.webDesignPreviewResponse(req('/robots.txt','GET','web.orderfly.dk'));assert.match(await preview.text(),/Disallow: \//);assert.match(preview.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await server.webDesignPreviewResponse(req('/sitemap.xml','GET','web.orderfly.dk'))).status,404);
 }finally{delete process.env.ESMERALDA_PUBLIC_ENABLED;}
});
test('CSP is host mode/path scoped and denies arbitrary endpoints/forms',()=>{
 const home=lib.esmeraldaPublicHeaders('/')['Content-Security-Policy'];const booking=lib.esmeraldaPublicHeaders('/bordbooking')['Content-Security-Policy'];
 assert.doesNotMatch(home,/supabase/);assert.match(booking,/https:\/\/bdemvarwpfcxyczunchx.supabase.co\/functions\/v1\/booking-api/);assert.match(home,/form-action 'none'/);assert.doesNotMatch(home,/\*|https:;/);
 assert.match(lib.esmeraldaPublicHeaders('/kontakt')['Content-Security-Policy'],/www.google.com\/maps\/embed/);assert.doesNotMatch(home,/maps\/embed/);
});
