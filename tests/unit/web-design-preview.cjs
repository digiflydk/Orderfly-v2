const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {loadTs} = require('../helpers/load-ts.cjs');
const manifest = require('../../preview/esmeralda/manifest.json');
const lib = loadTs('src/lib/web-design-preview.ts');
const server = loadTs('src/lib/web-design-preview-server.ts', {'../../preview/esmeralda/manifest.json':{default:manifest}});
function req(path, method='GET', host='web.orderfly.dk') {
  return new Request('https://backend.internal/internal-web-preview?path='+encodeURIComponent(path),{method,headers:{'x-forwarded-host':host}});
}
function mw(url,method='GET',headers={}) {
  class NextResponse extends Response {
    static next(){return {kind:'next'};}
    static rewrite(url,options){return {kind:'rewrite',url,options};}
    static redirect(url,status){return {kind:'redirect',url,status};}
  }
  const m=loadTs('src/middleware.ts',{'next/server':{NextResponse}});
  const u=new URL(url);u.clone=()=>new URL(url);
  return m.middleware({url,nextUrl:u,method,headers:new Headers({host:u.host,...headers})});
}
test('exact preview host and reserved slug; no lookalike or comma-list hosts',()=>{
  for(const host of ['web.orderfly.dk','WEB.ORDERFLY.DK:443']) assert.equal(lib.isWebDesignPreviewHost(host),true);
  for(const host of ['web.orderfly.dk.evil','evilweb.orderfly.dk','web.orderfly.dk, evil','web.localhost','orderfly.dk','web.orderfly.dk:3000']) assert.equal(lib.isWebDesignPreviewHost(host),false);
  const brand=loadTs('src/lib/brand-subdomain.ts');assert.match(brand.brandSlugError('web'),/reserveret/);assert.equal(brand.brandSlugFromHost('web.orderfly.dk'),null);
});
test('all web paths intercepted; query cannot override original route; internal URL denied',()=>{
  for(const p of ['/','/api/health','/merchant','/_next/image','/_next/static/foo.js','/favicon.ico','/mpanel/hr/timelog']) {
    const r=mw('https://web.orderfly.dk'+p+'?path=/');assert.equal(r.kind,'rewrite');assert.equal(r.url.pathname,lib.WEB_PREVIEW_INTERNAL);assert.equal(r.url.searchParams.get('path'),p);assert.equal(r.options.headers['X-Robots-Tag'],'noindex, nofollow, noarchive');
  }
  assert.equal(mw('http://web.orderfly.dk/menu').status,308);
  assert.equal(mw('https://web.orderfly.dk/internal-web-preview').status,404);
  assert.equal(mw('https://orderfly.dk/internal-web-preview').status,404);
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) assert.equal(mw('https://web.orderfly.dk/api/checkout',method).status,405);
});
test('apex and merchants retain routing and excluded asset behavior',()=>{
  assert.equal(mw('https://orderfly.dk/').kind,'next');
  assert.equal(mw('https://orderfly.dk/api/health').kind,'next');
  assert.equal(mw('https://esmeralda.orderfly.dk/').url.pathname,'/esmeralda');
  assert.equal(mw('https://esmeralda.orderfly.dk/api/health').kind,'next');
  for(const host of ['orderfly.dk','esmeralda.orderfly.dk','www.orderfly.dk']) for(const path of ['/_next/image','/_next/static/x.js','/favicon.ico']) assert.equal(mw('https://'+host+path).kind,'next');
  assert.equal(mw('https://www.orderfly.dk/').status,308);
});
test('104 HTML and269 assets retain exact hashes, plus robots; correct MIME and HEAD',async()=>{
  assert.equal(Object.keys(manifest.routes).length,374);
  for(const [path,entry] of Object.entries(manifest.routes)) {
    const r=await server.webDesignPreviewResponse(req(path));assert.equal(r.status,200,path);
    const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,entry.size,path);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,path);
    assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
    const h=await server.webDesignPreviewResponse(req(path,'HEAD'));assert.equal(h.status,200);assert.equal(await h.text(),'');assert.equal(h.headers.get('content-length'),String(entry.size));assert.equal(h.headers.get('content-type'),r.headers.get('content-type'));
    assert.notEqual(r.headers.get('content-type'),'application/octet-stream',entry.file);
  }
});
test('server independently denies off-host, methods, traversal, private/API and unknown routes',async()=>{
  for(const host of ['orderfly.dk','esmeralda.orderfly.dk','web.orderfly.dk.evil']) assert.equal((await server.webDesignPreviewResponse(req('/','GET',host))).status,404);
  assert.equal((await server.webDesignPreviewResponse(req('/','POST'))).status,405);
  for(const path of ['/api/health','/_next/image','/mpanel','/finance-admin','/internal-web-preview','/unknown','/../index.html','/%2e%2e/index.html','/%','/index.html','//','/menu/']) assert.equal((await server.webDesignPreviewResponse(req(path))).status,404,path);
  assert.equal(await (await server.webDesignPreviewResponse(req('/missing','HEAD'))).text(),'');
});
test('payload corruption fails closed; tracing and policy retain deployment isolation',async()=>{
  const bad=loadTs('src/lib/web-design-preview-server.ts',{'../../preview/esmeralda/manifest.json':{default:manifest},'node:fs/promises':{readFile:async()=>Buffer.from('corrupt')}});
  assert.equal((await bad.webDesignPreviewResponse(req('/'))).status,503);
  assert.match(fs.readFileSync('next.config.js','utf8'),/preview\/esmeralda\/payload.json.gz/);
  assert.match(lib.WEB_PREVIEW_HEADERS['Content-Security-Policy'],/connect-src 'self'; form-action 'none'; frame-src 'none'/);
  assert.ok(!fs.existsSync('public/preview'));
});
