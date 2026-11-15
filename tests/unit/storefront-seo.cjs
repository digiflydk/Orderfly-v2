const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const {storefrontMenuMetadata,publicSitemap}=loadTs('src/lib/storefront-seo.ts');
test('menu metadata has useful title, description and a stable parameter-free brand canonical',()=>{
 const m=storefrontMenuMetadata({slug:'esmeralda',name:'Esmeralda Pizza'},{slug:'amager',name:'Esmeralda Pizza Amager'});
 assert.match(m.title.absolute,/Amager/);assert.match(m.description,/priser og tilvalg/);assert.equal(m.alternates.canonical,'https://esmeralda.orderfly.dk/amager');assert.equal(m.openGraph.url,m.alternates.canonical);assert.equal(m.twitter.description,m.description);
});
test('invalid slugs never become indexable metadata',()=>{for(const slug of ['../other','api','evil.example'])assert.equal(storefrontMenuMetadata({slug,name:'X'},{slug:'menu',name:'Y'}).robots.index,false);});
test('sitemap escapes XML and removes duplicate URLs',()=>{const xml=publicSitemap('https://example.com',['/a?x=1&y=2','/a?x=1&y=2']);assert.match(xml,/&amp;/);assert.equal((xml.match(/<loc>/g)||[]).length,1);});
function route(file,host,brand,locations,queries){return loadTs(file,{'next/headers':{headers:async()=>new Headers({host})},'@/lib/data/brand-location':{getBrandBySlug:async slug=>{queries.push(['brand',slug]);return brand},getLocationsForBrand:async id=>{queries.push(['locations',id]);return locations}}});}
test('robots advertises an absolute sitemap for the actual brand and rejects arbitrary host origins',async()=>{
 for(const [host,expected]of [['esmeralda.orderfly.dk','https://esmeralda.orderfly.dk'],['other.orderfly.dk','https://other.orderfly.dk'],['esmeralda.orderfly.dk.evil.test','https://orderfly.dk']]){const response=await route('src/app/robots.txt/route.ts',host,null,[],[]).GET();assert.match(await response.text(),new RegExp('Sitemap: '+expected.replaceAll('.','\\.')+'/sitemap.xml'));}
});
test('brand sitemap includes active owned routes only, excluding checkout and other tenants',async()=>{
 const queries=[];const r=await route('src/app/sitemap.xml/route.ts','esmeralda.orderfly.dk',{id:'b',slug:'esmeralda',status:'active'},[{brandId:'b',slug:'amager',isActive:true},{brandId:'other',slug:'foreign',isActive:true},{brandId:'b',slug:'closed',isActive:false},{brandId:'b',slug:'../bad',isActive:true},{brandId:'b',slug:'club',isActive:true},{brandId:'b',slug:'checkout',isActive:true}],queries).GET();const xml=await r.text();assert.match(xml,/<loc>https:\/\/esmeralda.orderfly.dk\/amager<\/loc>/);assert.doesNotMatch(xml,/foreign|closed|checkout|club|bad/);assert.deepEqual(queries,[['brand','esmeralda'],['locations','b']]);
});
test('suspended or absent brand has no sitemap and does not query locations',async()=>{for(const brand of [null,{id:'b',status:'suspended'}]){const q=[];assert.equal((await route('src/app/sitemap.xml/route.ts','esmeralda.orderfly.dk',brand,[],q).GET()).status,404);assert.equal(q.length,1);}});

test('reserved app paths and brand-named locations retain their required brand prefix',async()=>{
 for(const slug of ['esmeralda','feedback']) {
  const expected='https://esmeralda.orderfly.dk/esmeralda/'+slug;
  assert.equal(storefrontMenuMetadata({slug:'esmeralda',name:'Esmeralda'},{slug,name:slug}).alternates.canonical,expected);
  const r=await route('src/app/sitemap.xml/route.ts','esmeralda.orderfly.dk',{id:'b',slug:'esmeralda'},[{brandId:'b',slug,isActive:true}],[]).GET();
  assert.ok((await r.text()).includes('<loc>'+expected+'</loc>'));
 }
});
test('names typed with stray spaces never leak into titles or descriptions',()=>{
 const m=storefrontMenuMetadata({slug:'esmeralda',name:'Esmeralda Pizza '},{slug:'amager',name:'Esmeralda Pizza Amager '});
 assert.equal(m.title.absolute,'Menukort og takeaway | Esmeralda Pizza Amager');assert.match(m.description,/hos Esmeralda Pizza Amager\. /);assert.equal(m.openGraph.siteName,'Esmeralda Pizza');
 assert.equal(storefrontMenuMetadata({slug:'esmeralda',name:'Esmeralda Pizza'},{slug:'amager',name:'  '}).title.absolute,'Menukort og takeaway | Esmeralda Pizza');
});
test('one orderable restaurant: the brand root is not in the sitemap; with two it is',async()=>{
 const locs=extra=>[{brandId:'b',slug:'amager',isActive:true},{brandId:'b',slug:'closed',isActive:false},{brandId:'other',slug:'foreign',isActive:true},...extra];
 const one=await (await route('src/app/sitemap.xml/route.ts','esmeralda.orderfly.dk',{id:'b',slug:'esmeralda',status:'active'},locs([]),[]).GET()).text();
 assert.deepEqual([...one.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),['https://esmeralda.orderfly.dk/amager']);
 const two=await (await route('src/app/sitemap.xml/route.ts','esmeralda.orderfly.dk',{id:'b',slug:'esmeralda',status:'active'},locs([{brandId:'b',slug:'borgergade',isActive:true}]),[]).GET()).text();
 assert.deepEqual([...two.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),['https://esmeralda.orderfly.dk/','https://esmeralda.orderfly.dk/amager','https://esmeralda.orderfly.dk/borgergade']);
});
test('brand root goes straight to the only restaurant, keeping campaign parameters; the picker stays for several',async()=>{
 const React=require('react');
 const loadTsx=(file,mocks)=>{const ts=require('typescript'),fs=require('node:fs');const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:{},mod,mod.exports);return mod.exports;};
 const page=(host,locations,originalQuery)=>{const redirects=[];const mod=loadTsx('src/app/[brandSlug]/page.tsx',{'@/lib/storefront-single-location':loadTs('src/lib/storefront-single-location.ts'),react:React,'react/jsx-runtime':require('react/jsx-runtime'),
  'next/headers':{headers:async()=>new Headers({host,...(originalQuery!==undefined?{'x-orderfly-original-query':originalQuery}:{})})},
  'next/navigation':{notFound:()=>{throw Error('not found');},redirect:href=>{redirects.push(href);throw Object.assign(Error('NEXT_REDIRECT'),{href});}},
  '@/lib/server/storefront-path':loadTs('src/lib/server/storefront-path.ts',{'server-only':{},'next/headers':{headers:async()=>new Headers({host})}}),
  '@/lib/data/brand-location':{getBrandBySlug:async()=>({id:'b',slug:'esmeralda',name:'Esmeralda'}),getLocationsForBrand:async()=>locations,getBrandAndLocation:async()=>({})},
  '@/lib/server/catalog':{},'@/lib/log':{},'@/components/catalog/product-grid':{default:()=>null},'@/components/ui/empty-state':{default:()=>null},'@/components/location-card':{LocationCard:()=>null},'@/lib/menu-helpers':{},'@/lib/next/resolve-props':{}});
  return {redirects,render:search=>mod.default({params:Promise.resolve({brandSlug:'esmeralda'}),searchParams:Promise.resolve(search)})};};
 const amager={brandId:'b',slug:'amager',isActive:true,deliveryTypes:['pickup','delivery']},closed={brandId:'b',slug:'closed',isActive:false,deliveryTypes:['pickup']};
 let p=page('esmeralda.orderfly.dk',[amager,closed]);
 await assert.rejects(p.render({utm_source:'facebook',tag:['a','b']}),/NEXT_REDIRECT/);
 assert.deepEqual(p.redirects,['/amager?utm_source=facebook&tag=a&tag=b']);
 // On orderfly.dk the brand prefix stays.
 p=page('orderfly.dk',[amager]);await assert.rejects(p.render({}),/NEXT_REDIRECT/);assert.deepEqual(p.redirects,['/esmeralda/amager']);
 // Production can render the brand root without searchParams; the middleware's recorded query is used, re-encoded.
 p=page('esmeralda.orderfly.dk',[amager],'?utm_source=facebook&x=%22a%20b%22');await assert.rejects(p.render({}),/NEXT_REDIRECT/);assert.deepEqual(p.redirects,['/amager?utm_source=facebook&x=%22a+b%22']);
 p=page('esmeralda.orderfly.dk',[amager],'');await assert.rejects(p.render({}),/NEXT_REDIRECT/);assert.deepEqual(p.redirects,['/amager']);
 // Two active restaurants, or none: the picker page renders, no redirect.
 for(const list of [[amager,{...amager,slug:'borgergade'}],[closed],[]]){p=page('esmeralda.orderfly.dk',list);const tree=await p.render({});assert.ok(tree);assert.deepEqual(p.redirects,[]);}
});
