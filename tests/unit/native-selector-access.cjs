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
