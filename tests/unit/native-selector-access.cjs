const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const forbidden=()=>Object.assign(new Error('forbidden'),{status:403});
test('selector metadata combines only independently authorized native scopes and excludes private fields',async()=>{
 const reads=[];
 const records={'brands/b':{name:'Own',ownerId:'private',status:'active'},'brands/c':{name:'Other permitted',status:'active'},'locations/l':{brandId:'b',name:'Own location',isActive:true},'locations/foreign':{brandId:'foreign',name:'Foreign'}};
 const doc=path=>({get:async()=>{reads.push(path);return{id:path.split('/').at(-1),exists:!!records[path],data:()=>records[path]};}});
 const db={collection:name=>({doc:id=>doc(name+'/'+id)})};
 const decisions=[];
 const api=loadTs('src/lib/access/native-catalog.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./orderfly-session':{
  orderflySession:async()=>({superuser:false,permissions:['orderfly.orders:view','orderfly.catalog:view','platform.roles:view','orderfly.orders:edit']}),
  orderflyReadGrants:async permission=>{decisions.push(permission);return permission==='orderfly.orders:view'?[{brandId:'b',locationIds:['l','foreign']}]:[{brandId:'c',locationIds:[]}];},
 }});
 const result=await api.selectorCatalog();assert.equal(result.superuser,false);
 assert.deepEqual(result.brands.map(x=>x.id),['b','c']);assert.deepEqual(result.locations.map(x=>x.id),['l']);
 assert.deepEqual(decisions.sort(),['orderfly.catalog:view','orderfly.orders:view']);
 assert.equal(result.brands[0].ownerId,undefined);assert.ok(!reads.includes('brands/foreign'));
});
test('revoked per-feature grants disappear while authority outages remain visible',async()=>{
 for(const status of [403,503]){
  const api=loadTs('src/lib/access/native-catalog.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('must not read data');}},'./orderfly-session':{
   orderflySession:async()=>({superuser:false,permissions:['orderfly.orders:view']}),orderflyReadGrants:async()=>{throw Object.assign(new Error('denied'),{status});},
  }});
  if(status===403)assert.deepEqual((await api.selectorCatalog()).brands,[]);else await assert.rejects(api.selectorCatalog(),e=>e.status===503);
 }
});
test('administrative list actions reject before opening the database when no current session exists',async()=>{
 for(const [path,method] of [['brands','getBrands'],['locations','getAllLocations']]){
  const api=loadTs('src/app/superadmin/'+path+'/actions.ts',{'server-only':{},'@/lib/access/native-catalog':{selectorCatalog:async()=>{throw forbidden();}},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('must not read data');}}});
  await assert.rejects(api[method](),e=>e.status===403);
 }
});

test('public native lookups expose finite storefront fields and keep canonical identity',async()=>{
 const {fixture,brand,location}=require('../helpers/brand-location-fixture.cjs');
 const f=fixture([['brands/b',{...brand,id:'forged',ownerId:'private-owner',subscriptionPlanId:'private-plan',stripeSecret:'private-key'}],['locations/l',{...location,id:'forged',brandId:'b',isActive:true,integrationToken:'private-token'}]]);
 for(const value of [await f.brands.getBrandById('b'),await f.brands.getBrandBySlug(brand.slug)]){
  assert.equal(value.id,'b');assert.equal(value.name,brand.name);assert.equal(value.ownerId,'');assert.equal(value.subscriptionPlanId,undefined);assert.equal(value.stripeSecret,undefined);
 }
 for(const value of [await f.locations.getLocationById('l'),await f.locations.getLocationBySlug('b',location.slug),await f.locations.getActiveLocationBySlug('b',location.slug)]){
  assert.equal(value.id,'l');assert.equal(value.integrationToken,undefined);assert.deepEqual(value.openingHours,location.openingHours);
 }
 assert.equal((await f.brands.getBrandForAdministration('b')).ownerId,'private-owner');
});
test('private brand editor lookup requires current platform authority before database access',async()=>{
 const api=loadTs('src/app/superadmin/brands/actions.ts',{'server-only':{},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{throw forbidden();}},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('must not read data');}}});
 await assert.rejects(api.getBrandForAdministration('b'),e=>e.status===403);
});

test('actual storefront loaders serialize only public brand and location fields',async()=>{
 const records={brands:{id:'brand',data:()=>({id:'forged',slug:'pizza',name:'Pizza',ownerId:'private-owner',subscriptionPlanId:'private-plan',integrationSecret:'private-secret'})},locations:{id:'location',data:()=>({id:'forged',brandId:'brand',slug:'shop',name:'Shop',email:'private-email',integrationSecret:'private-secret'})}};
 const db={collection:name=>{const q={where:()=>q,limit:()=>q,get:async()=>({empty:false,docs:[records[name]]})};return q;}};
 const api=loadTs('src/lib/data/brand-location.ts',{'@/lib/firebase-admin':{getAdminDb:()=>db},react:{cache:fn=>fn},'next/cache':{unstable_cache:fn=>fn},'@/lib/storefront-media':{storefrontMedia:value=>value}});
 const brand=await api.getBrandBySlug('pizza');
 assert.equal(brand.id,'brand');assert.equal(brand.name,'Pizza');assert.equal(brand.ownerId,'');assert.equal(brand.subscriptionPlanId,undefined);assert.equal(brand.integrationSecret,undefined);
 for(const location of [await api.getLocationBySlug('brand','shop'),...(await api.getLocationsForBrand('brand'))]){
  assert.equal(location.id,'location');assert.equal(location.brandId,'brand');assert.equal(location.name,'Shop');assert.equal(location.email,undefined);assert.equal(location.integrationSecret,undefined);
 }
 const combined=await api.getBrandAndLocation('pizza','shop');assert.equal(combined.ok,true);assert.equal(combined.brandMatchesLocation,true);assert.ok(!JSON.stringify(combined).includes('private-'));
});
