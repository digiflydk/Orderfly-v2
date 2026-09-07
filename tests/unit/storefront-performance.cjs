const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const sharp=require('sharp');
function load(path,mocks={}) {
 const mod={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',js)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const media=load('src/lib/storefront-media.ts');
test('inline pictures become short versioned URLs; image response is compressed, cacheable and scoped',async()=>{
 const bytes=await sharp({create:{width:1600,height:1000,channels:3,background:'#c03020'}}).png().toBuffer();
 const inline='data:image/png;base64,'+bytes.toString('base64');
 const original={id:'p',isActive:true,imageUrl:inline,nested:{logoUrl:inline}};
 const converted=media.storefrontMedia(original,'products','p');
 assert.ok(JSON.stringify(converted).length<JSON.stringify(original).length/4);
 assert.equal(original.imageUrl,inline);
 assert.equal(new URL('https://test'+converted.nested.logoUrl).searchParams.get('field'),'nested.logoUrl');
 let active=true,reads=0;
 const api=load('src/app/api/storefront-image/route.ts',{'@/lib/storefront-media':media,'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>{reads++;return {data:()=>({...original,isActive:active})};}})})})}});
 const request=url=>new Request('https://test'+url);
 const response=await api.GET(request(converted.imageUrl));
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
 assert.match(response.headers.get('cache-control'),/max-age/);
 const output=Buffer.from(await response.arrayBuffer());
 assert.equal((await sharp(output).metadata()).width,960);assert.ok(output.length<bytes.length);
 assert.equal((await api.GET(request(converted.imageUrl.replace('products','customers')))).status,400);
 assert.equal(reads,1);
 assert.equal((await api.GET(request(converted.imageUrl.replace(/v=[a-f0-9]+/,'v='+'0'.repeat(24))))).status,404);
 active=false;assert.equal((await api.GET(request(converted.imageUrl))).status,404);
});
test('menu cache separates tenants and locations and refreshes after tag invalidation',async()=>{
 const cache=new Map();let reads=0;let productName='old';const options=[];
 const db={collection:collection=>{const filters={};const q={where:(k,op,v)=>{filters[k]=v;return q;},get:async()=>{reads++;return {docs:[{id:collection==='products'?'p':'c',data:()=>collection==='products'?{productName,brandId:filters.brandId,isActive:true,categoryId:'c'}:{categoryName:'Pizza'}}]};}};return q;}};
 const catalog=load('src/lib/server/catalog.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/storefront-media':media,'next/cache':{unstable_cache:(fn,keys,opts)=>{options.push(opts);return async(...args)=>{const key=JSON.stringify([keys,args]);if(!cache.has(key))cache.set(key,await fn(...args));return cache.get(key);};}}});
 await catalog.getMenuForRender({brandId:'a',locationId:'l'});await catalog.getMenuForRender({brandId:'a',locationId:'l'});assert.equal(reads,2);
 await catalog.getMenuForRender({brandId:'b',locationId:'l'});assert.equal(reads,4);
 await catalog.getMenuForRender({brandId:'b',locationId:'other'});assert.equal(reads,6);
 assert.deepEqual(options[0].tags,['storefront']);assert.equal(options[0].revalidate,60);
 productName='new';cache.clear();const menu=await catalog.getMenuForRender({brandId:'a',locationId:'l'});assert.equal(menu.productsByCategory.c[0].productName,'new');
});
test('cached campaign rows still filter delivery method and expiration on every request',async()=>{
 const path='src/app/superadmin/standard-discounts/actions.ts';
 const imports=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],{}]));
 imports.zod=require('zod');imports['@/lib/promotion-rules']=load('src/lib/promotion-rules.ts');
 const actual=load(path,imports);
 const row={id:'offer',orderTypes:['delivery'],activeDays:[],activeTimeSlots:[],endDate:'2099-01-01T00:00:00Z'};
 const api=load('src/app/storefront-actions.ts',{'@/lib/storefront-cache':{storefrontRows:async()=>[row]},'@/app/superadmin/standard-discounts/actions':actual});
 const params={brandId:'b',locationId:'l',deliveryType:'delivery'};
 assert.equal((await api.getStorefrontDiscounts(params)).length,1);
 assert.equal((await api.getStorefrontDiscounts({...params,deliveryType:'pickup'})).length,0);
 row.endDate='2000-01-01T00:00:00Z';assert.equal((await api.getStorefrontDiscounts(params)).length,0);
});
