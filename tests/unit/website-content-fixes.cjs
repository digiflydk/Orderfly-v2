// Content fixes on the pinned website payload (scripts/website-content-fixes.cjs): repeated word, duplicate dessert.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const {applyContentFixes,reverseContentFixes,CARD_MARKER}=require('../../scripts/website-content-fixes.cjs');
const {WEBSITE_REDIRECTS,sitemapUrls}=require('../helpers/website-redirects.cjs');
const manifest=require('../../preview/esmeralda/manifest.json');
const discovery=require('../../preview/esmeralda/production-discovery.json');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
const payload=JSON.parse(zlib.gunzipSync(packed));
const html=route=>Buffer.from(payload[route].data,'base64').toString();
const pages=Object.keys(payload).filter(route=>html(route).trimStart().toLowerCase().startsWith('<!doctype html'));
const server=loadTs('src/lib/web-design-preview-server.ts',{'../../preview/esmeralda/manifest.json':{default:manifest},'../../preview/esmeralda/production-discovery.json':{default:discovery}});
const req=(p,host='www.esmeraldapizza.dk')=>new Request('https://backend.internal'+p,{headers:{host,'x-forwarded-proto':'https'}});

test('pinned payload carries the content fixes exactly once and reversibly',()=>{
 assert.equal(hash(packed),manifest.payload_sha256);
 assert.equal(manifest.content_fixes?.version,1);
 assert.equal(pages.length,104);
 for(const route of pages){
  assert.doesNotMatch(html(route),/Stenovnspizza Stenovnspizza/,route);
  assert.equal(applyContentFixes(route,reverseContentFixes(route,html(route))),html(route),route);
 }
 for(const route of ['/dishes/15-pastrami-speciale','/menu','/menu/pizza'])assert.match(html(route),/Stenovnspizza Pastrami Speciale/,route);
 const desserts=html('/menu/desserter');
 assert.equal(desserts.split('href="/dishes/hjemmelavet-tiramisu"').length-1,1);
 assert.ok(!desserts.includes('href="/dishes/hjemmelavet-tiramisu-2"'));
 // The two-portion product is a different dish and stays.
 assert.equal(desserts.split('href="/dishes/hjemmelavet-tiramisu-2-stk"').length-1,1);
 for(const route of pages)if(route!=='/dishes/hjemmelavet-tiramisu-2')assert.ok(!html(route).includes('href="/dishes/hjemmelavet-tiramisu-2"'),route);
 assert.equal(desserts.split(CARD_MARKER).length-1,1);
});
test('retired duplicate dessert page redirects permanently and is left out of the sitemap',async()=>{
 assert.deepEqual(WEBSITE_REDIRECTS,{'/dishes/hjemmelavet-tiramisu-2':'/dishes/hjemmelavet-tiramisu'});
 process.env.ESMERALDA_PUBLIC_ENABLED='true';
 try{
  for(const host of ['www.esmeraldapizza.dk','web.orderfly.dk']){
   const r=await server.webDesignPreviewResponse(req('/dishes/hjemmelavet-tiramisu-2?utm_source=kampagne',host));
   assert.equal(r.status,308,host);assert.equal(r.headers.get('location'),'/dishes/hjemmelavet-tiramisu?utm_source=kampagne',host);
   assert.equal((await server.webDesignPreviewResponse(req('/dishes/hjemmelavet-tiramisu',host))).status,200,host);
   assert.equal((await server.webDesignPreviewResponse(req('/dishes/hjemmelavet-tiramisu-2-stk',host))).status,200,host);
  }
  const locs=[...((await(await server.webDesignPreviewResponse(req('/sitemap.xml'))).text()).matchAll(/<loc>([^<]+)<\/loc>/g))].map(x=>x[1]);
  assert.deepEqual(locs,sitemapUrls(discovery));assert.equal(locs.length,103);
  assert.ok(!locs.some(url=>url.endsWith('/dishes/hjemmelavet-tiramisu-2')));
 }finally{delete process.env.ESMERALDA_PUBLIC_ENABLED;}
});
