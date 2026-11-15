const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const manifest=require('../../preview/esmeralda/manifest.json'),variants=require('../../preview/esmeralda/variants.json');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),html=route=>Buffer.from(payload[route].data,'base64').toString();
// Count variant images as the landing repair left them: the later content fix removed one duplicate dessert card.
const {reverseContentFixes}=require('../../scripts/website-content-fixes.cjs');
const landingHtml=route=>manifest.content_fixes?reverseContentFixes(route,html(route)):html(route);
const pages=Object.keys(payload).filter(r=>payload[r].file.endsWith('.html'));
test('every dish image variant is a pinned, smaller 760 px AVIF of a payload image',()=>{
 assert.ok(Object.keys(variants.routes).length>=70);
 for(const [route,v] of Object.entries(variants.routes)){
  const bytes=fs.readFileSync(`preview/esmeralda/variants/${route.slice('/_assets/'.length)}`);
  assert.equal(hash(bytes),v.sha256,route);assert.equal(bytes.length,v.size,route);assert.equal(route,`/_assets/${v.sha256.slice(0,24)}.avif`);
  assert.equal(bytes.subarray(4,12).toString('latin1'),'ftypavif',route);assert.equal(v.width,760);
  assert.ok(Object.hasOwn(manifest.routes,v.source),v.source);assert.ok(!Object.hasOwn(manifest.routes,route),'never shadows a payload route');
  assert.ok(v.size<v.sourceBytes*0.8,route);assert.ok(v.sourceWidth>760);
 }
 assert.equal(manifest.landing_repairs.variants_sha256,hash(fs.readFileSync('preview/esmeralda/variants.json')));
});
test('pages offer only existing variants for their own image and drop the Webflow CDN',()=>{
 let tagged=0;
 for(const route of pages){
  const page=landingHtml(route);assert.ok(!page.includes('cdn.prod.website-files.com'),route);
  for(const tag of page.match(/<img data-es-variant="1"[^>]*>/g)||[]){
   tagged++;const [,small,src,width]=tag.match(/srcset="(\/_assets\/[^ ]+) 760w, (\/_assets\/[^ ]+) (\d+)w"/);
   assert.equal(variants.routes[small].source,src,route);assert.match(tag,new RegExp(`\\bsrc="${src}"`));assert.equal(Number(width),variants.routes[small].sourceWidth);
   assert.match(tag,/ sizes="\(max-width: 767px\) calc\(100vw - 32px\), /);assert.match(tag,/loading="lazy"|loading="eager"/);
  }
 }
 assert.equal(tagged,manifest.landing_repairs.images_with_variants);assert.ok(tagged>=400);
 assert.ok(html('/menu').includes('<style data-es-landing="v1">#wf-form-Dish-category .collection-list-wrapper{position:relative;max-width:100%;overflow-x:auto'));
});
test('the server serves pinned variants and a branded noindex 404 page',async()=>{
 process.env.ESMERALDA_PUBLIC_ENABLED='true';
 try{
  const server=loadTs('src/lib/web-design-preview-server.ts',{'../../preview/esmeralda/manifest.json':{default:manifest},'../../preview/esmeralda/production-discovery.json':{default:require('../../preview/esmeralda/production-discovery.json')},'../../preview/esmeralda/variants.json':{default:variants}});
  const req=(p,method='GET',host='www.esmeraldapizza.dk')=>new Request('https://backend.internal'+p,{method,headers:{host,'x-forwarded-proto':'https'}});
  const [route,v]=Object.entries(variants.routes)[0];
  for(const host of ['www.esmeraldapizza.dk','web.orderfly.dk']){
   const r=await server.webDesignPreviewResponse(req(route,'GET',host));assert.equal(r.status,200,host);assert.equal(r.headers.get('content-type'),'image/avif');
   assert.equal(hash(Buffer.from(await r.arrayBuffer())),v.sha256);
  }
  for(const path of ['/findes-ikke','/_assets/000000000000000000000000.avif','/menu/','/Menu']){
   const r=await server.webDesignPreviewResponse(req(path));assert.equal(r.status,404,path);assert.match(r.headers.get('x-robots-tag'),/noindex/);
   assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');const body=await r.text();
   assert.match(body,/<title>Siden findes ikke \| Esmeralda Pizza &amp; Restaurant<\/title>/);assert.match(body,/<meta name="robots" content="noindex, nofollow">/);
   for(const href of ['/menu','/bordbooking','/','/kontakt','tel:+4532505040'])assert.ok(body.includes(`href="${href}"`),href);
   assert.doesNotMatch(body,/<script/);
  }
  const head=await server.webDesignPreviewResponse(req('/findes-ikke','HEAD'));assert.equal(head.status,404);assert.equal(await head.text(),'');
  for(const asset of ['/_assets/cbdfddea996fb10f5850db63.png','/_assets/31f776328347ab431379fbb8.jpg'])assert.ok(Object.hasOwn(manifest.routes,asset),asset);
 }finally{delete process.env.ESMERALDA_PUBLIC_ENABLED;}
});
