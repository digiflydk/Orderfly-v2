const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const link=loadTs('src/lib/product-link.ts');
test('product link slugs match the website dish addresses and spell out Danish letters',()=>{
 assert.equal(link.productLinkSlug('1. Margherita (V)'),'1-margherita-v');
 assert.equal(link.productLinkSlug('Æble & Øl på Ålborg'),'aeble-oel-paa-aalborg');
 assert.equal(link.productLinkSlug('  Crème brûlée '),'creme-brulee');
 assert.equal(link.productLinkSlug(''),'');
});
test('an ambiguous or empty name falls back to the product id; combo-only products get no link',()=>{
 const links=link.productLinkSlugs([{id:'a',productName:'Cola'},{id:'b',productName:'cola'},{id:'c',productName:'Fanta'},{id:'d',productName:''},{id:'e',productName:'Dip',comboOnly:true},{id:'c',productName:'Fanta'}]);
 assert.deepEqual([...links],[['a','a'],['b','b'],['c','fanta'],['d','d']]);
});
test('a link resolves only to its own product; unknown, oversized and stale values are rejected',()=>{
 const links=link.productLinkSlugs([{id:'p1',productName:'Margherita'},{id:'p2',productName:'Pepperoni'}]);
 assert.equal(link.productIdForLink(links,'pepperoni'),'p2');
 assert.equal(link.productIdForLink(links,' margherita '),'p1');
 assert.equal(link.productIdForLink(links,'p1'),'p1');
 for(const value of [null,'','hawaii','x'.repeat(121),'Pepperoni'])assert.equal(link.productIdForLink(links,value),null,String(value));
});
test('the address keeps every other parameter when the product link changes',()=>{
 assert.equal(link.withProductLink('https://esmeralda.orderfly.dk/amager?deliveryMethod=pickup&utm_source=fb','1-margherita-v'),'/amager?deliveryMethod=pickup&utm_source=fb&produkt=1-margherita-v');
 assert.equal(link.withProductLink('https://esmeralda.orderfly.dk/amager?produkt=x&deliveryMethod=pickup#menu',null),'/amager?deliveryMethod=pickup#menu');
});
test('a shared product link previews the product while the canonical stays the menu',()=>{
 const seo=loadTs('src/lib/storefront-seo.ts');
 const brand={slug:'esmeralda',name:'Esmeralda'},location={slug:'amager',name:'Esmeralda Pizza Amager'};
 const meta=seo.storefrontProductMetadata(brand,location,{productName:'1. Margherita (V)',description:'Tomatsauce og mozzarella.',imageUrl:'/images/margherita.webp'},'1-margherita-v');
 assert.equal(meta.title.absolute,'1. Margherita (V) | Esmeralda Pizza Amager');
 assert.equal(meta.alternates.canonical,'https://esmeralda.orderfly.dk/amager');
 assert.equal(meta.openGraph.url,'https://esmeralda.orderfly.dk/amager?produkt=1-margherita-v');
 assert.deepEqual(meta.openGraph.images,[{url:'https://esmeralda.orderfly.dk/images/margherita.webp'}]);
 const inline=seo.storefrontProductMetadata(brand,location,{productName:'Cola',imageUrl:'data:image/png;base64,AAAA'},'cola');
 assert.equal(inline.openGraph.images,undefined);assert.match(inline.description,/Bestil Cola hos Esmeralda Pizza Amager/);
});
