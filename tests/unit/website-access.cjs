const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(grants, rows, edit=false) {
 let reads=0; const seen=[];
 const snap=key=>({id:key.split('/').at(-1),exists:rows.has(key),data:()=>rows.get(key)});
 const api=loadTs('src/lib/superadmin/storefront-overview.ts',{'server-only':{},
  '@/lib/access/orderfly-session':{orderflyReadGrants:async permission=>{assert.equal(permission,'orderfly.website:view');if(grants instanceof Error)throw grants;return grants;},requireOrderflyAccess:async(...args)=>{seen.push(args);if(!edit)throw Object.assign(Error('forbidden'),{status:403});}},
  '@/lib/firebase-admin':{getAdminDb:()=>{reads++;return {collection:c=>({doc:id=>({get:async()=>snap(c+'/'+id)}),where:(field,op,value)=>({get:async()=>({docs:[...rows.keys()].filter(k=>k.startsWith(c+'/')&&rows.get(k)[field]===value).map(snap)})})})};}},
 });return {api,reads:()=>reads,seen};
}
test('website overview rejects missing website grants before touching database',async()=>{
 const f=fixture(Error('forbidden'),new Map());await assert.rejects(f.api.getStorefrontOverview(),/forbidden/);assert.equal(f.reads(),0);
});
test('location-scoped website viewer sees only owned permitted locations and cannot edit brand',async()=>{
 const rows=new Map([['brands/b',{name:'Own',slug:'own',status:'active',ownerEmail:'private'}],['locations/l',{brandId:'b',name:'Own location',slug:'one',isActive:true}],['locations/hidden',{brandId:'b',slug:'hidden',isActive:true}],['locations/foreign',{brandId:'other',slug:'foreign',isActive:true}]]);
 const f=fixture([{brandId:'b',locationIds:['l','foreign','missing']}],rows);
 const result=await f.api.getStorefrontOverview();assert.equal(result.length,1);assert.deepEqual(result[0].locations,[{id:'l',name:'Own location',active:true,href:'/own/one'}]);assert.equal(result[0].canEditBrand,false);assert.equal(result[0].ownerEmail,undefined);assert.deepEqual(f.seen,[['b',null,'orderfly.catalog:edit']]);
});
test('website overview reports native status and missing slugs, without inventing active CMS domains',async()=>{
 const rows=new Map([['brands/b',{name:'Beta',slug:'//external.test',status:'suspended'}],['locations/l',{brandId:'b',name:'Restaurant',slug:'restaurant',isActive:false}]]);
 const f=fixture([{brandId:'b',locationIds:null}],rows,true),[brand]=await f.api.getStorefrontOverview();
 assert.equal(brand.brandStatus,'suspended');assert.equal(brand.href,null);assert.equal(brand.canEditBrand,true);assert.equal(brand.locations[0].href,null);assert.equal(brand.locations[0].active,false);
});
test('public footer projection retains existing links without exposing old CMS payload or private fields',async()=>{
 let reads=0;
 const {getStorefrontLinks}=loadTs('src/lib/storefront-links.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({doc:path=>{reads++;assert.equal(path,'brands/b/website/config');return {get:async()=>({exists:true,data:()=>({social:{facebook:'https://example.test',privateToken:'secret'},legal:{customTerms:'/terms',usePlatformDefaults:true},tracking:{privateKey:'secret'},active:false})})};}})}});
 assert.deepEqual(await getStorefrontLinks('b'),{social:{facebook:'https://example.test'},legal:{customTerms:'/terms'}});
 assert.equal(await getStorefrontLinks('../b'),null);assert.equal(reads,1);
});
test('old brand CMS bookmark requires native brand website permission before redirect',async()=>{
 let allowed=false;const calls=[];
 const page=loadTs('src/app/superadmin/brands/[brandId]/website/[[...section]]/page.tsx',{'next/navigation':{redirect:path=>{calls.push(path);}},'@/lib/access/orderfly-session':{requireOrderflyAccess:async(...args)=>{assert.deepEqual(args,['b',null,'orderfly.website:view']);if(!allowed)throw Error('forbidden');}}});
 await assert.rejects(page.default({params:Promise.resolve({brandId:'b'})}),/forbidden/);assert.equal(calls.length,0);allowed=true;await page.default({params:Promise.resolve({brandId:'b'})});assert.deepEqual(calls,['/superadmin/brands/websites']);
});
test('retired header API returns explicit gone response rather than virtual CMS data',async()=>{
 const route=loadTs('src/app/api/public/brand-website/template-1/header/route.ts');assert.equal((await route.GET()).status,410);
});
