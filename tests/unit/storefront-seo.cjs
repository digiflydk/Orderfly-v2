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
