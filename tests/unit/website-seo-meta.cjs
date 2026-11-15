const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const manifest=require('../../preview/esmeralda/manifest.json');
const {seoMeta,reverseSeoMeta,GENERIC_TITLE}=require('../../scripts/website-seo-meta.cjs');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const pages=Object.entries(payload).filter(([,e])=>e.file.endsWith('.html')).map(([r,e])=>[r,Buffer.from(e.data,'base64').toString()]);
const head=h=>h.slice(0,h.indexOf('</head>'));
const content=(h,re)=>(head(h).match(re)||[])[1];
test('every page has its own title and a description; none keeps the exported generic title',()=>{
 assert.equal(pages.length,104);assert.equal(manifest.seo_meta.pages,91);
 const byTitle=new Map();
 for(const [route,h] of pages){
  assert.ok(!h.includes(GENERIC_TITLE),route);
  const title=content(h,/<title>([^<]+)<\/title>/),description=content(h,/<meta(?=[^>]*name="description")[^>]*content="([^"]+)"/);
  assert.ok(title&&title.length<=70,route+' title: '+title);assert.ok(description&&description.length>=40&&description.length<=200,route+' description: '+description);
  byTitle.set(title,[...(byTitle.get(title)||[]),route]);
 }
 // The dessert menu lists Hjemmelavet Tiramisu twice (two near-identical dish pages); a content issue, not a metadata one.
 const dups=[...byTitle].filter(([,r])=>r.length>1).map(([,r])=>r.sort());
 assert.deepEqual(dups,[['/dishes/hjemmelavet-tiramisu','/dishes/hjemmelavet-tiramisu-2']]);
});
test('dish metadata comes from the page itself and share images exist in the payload',()=>{
 let images=0;
 for(const [route,h] of pages){
  if(!h.includes('data-es-seo="v1"'))continue;
  const original=reverseSeoMeta(route,h),meta=seoMeta(route,original);
  assert.ok(meta,route);assert.ok(h.includes(`<title>${meta.title.replace(/&/g,'&amp;')}</title>`),route);
  const og=content(h,/<meta property="og:image" content="([^"]+)"/);
  if(og){images++;assert.ok(og.startsWith('https://www.esmeraldapizza.dk/_assets/'),og);assert.ok(Object.hasOwn(manifest.routes,og.slice('https://www.esmeraldapizza.dk'.length)),route);assert.match(h,/<meta name="twitter:card" content="summary_large_image"/);}
  if(route.startsWith('/dishes/')){assert.doesNotMatch(meta.title,/^\d/,'no menu number in the title');assert.doesNotMatch(meta.title,/\b(\p{L}+) \1\b/iu,route);}
 }
 assert.ok(images>=80,'most pages have a share image');
 const margherita=pages.find(([r])=>r==='/dishes/1-margherita-v')[1];
 assert.match(margherita,/<title>Stenovnspizza Margherita \(V\) \| Esmeralda Pizza Amager<\/title>/);
 assert.match(margherita,/<meta name="description" content="En enkel italiensk klassiker[^"]*"/);
 const pizza=pages.find(([r])=>r==='/menu/pizza')[1];assert.match(pizza,/<title>Pizza – menukort \| Esmeralda Pizza Amager<\/title>/);
});
test('pages that already had their own title and description are untouched',()=>{
 for(const route of ['/','/menu','/kontakt','/bordbooking','/faq']){const h=pages.find(([r])=>r===route)[1];assert.ok(!h.includes('data-es-seo'),route);}
});
