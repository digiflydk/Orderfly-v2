const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const identity={provider:'firebase',subject:'employee'};
function fixture(permission='orderfly.catalog:edit',locations=null){
 const records=new Map([
  ['brands/a',{}],['brands/b',{}],['locations/a1',{brandId:'a'}],['locations/b1',{brandId:'b'}],
  ['categories/d',{locationIds:['a1'],categoryName:'OLD'}],
  ['platformAdminControl/access-v1',{principals:[{id:principalKey(identity),active:true}],companies:[{id:'company',active:true,locationIds:['a1'],orderflyBrandIds:['a']}],roles:[{id:'reader',name:'Employee',companyId:'company',kind:'company_user',active:true,permissions:[permission]}],memberships:[{id:'m',principalId:principalKey(identity),companyId:'company',locationIds:locations,roleIds:['reader'],active:true}]}],
 ]);
 const writes=[];
 const ref=path=>({path});
 const db={collection:collection=>({doc:id=>ref(collection+'/'+id)}),runTransaction:async run=>{
  const staged=[];
  const result=await run({get:async ref=>({exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))}),set:(ref,data)=>staged.push(['set',ref.path,data]),delete:ref=>staged.push(['delete',ref.path])});
  for(const [kind,path,data]of staged){writes.push([kind,path]);if(kind==='set')records.set(path,data);else records.delete(path);}
  return result;
 }};
 const api=loadTs('src/lib/access/location-catalog.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./orderfly-session':{verifiedOrderflyIdentity:async()=>identity}});
 return{api,records,writes};
}
test('location-owned catalogue edits use current native ownership without a stored brandId',async()=>{
 const f=fixture();await f.api.mutateLocationCatalog('categories','d','orderfly.catalog:edit',before=>({...before,categoryName:'NEW'}));
 assert.equal(f.records.get('categories/d').categoryName,'NEW');assert.equal(f.writes.length,1);
});
test('view-only and revoked catalogue roles cannot edit categories',async()=>{
 for(const revoke of [false,true]){const f=fixture(revoke?'orderfly.catalog:edit':'orderfly.catalog:view');if(revoke)f.records.get('platformAdminControl/access-v1').memberships[0].active=false;
 await assert.rejects(f.api.mutateLocationCatalog('categories','d','orderfly.catalog:edit',before=>({...before,categoryName:'NEW'})),/forbidden/);assert.deepEqual(f.writes,[]);}
});
test('moving or sharing a category requires access to its original and resulting native locations',async()=>{
 for(const locations of [['b1'],['a1','b1'],[],['missing']]){const f=fixture();await assert.rejects(f.api.mutateLocationCatalog('categories','d','orderfly.catalog:edit',before=>({...before,brandId:'a',locationIds:locations})));assert.deepEqual(f.writes,[]);}
 const f=fixture();f.records.get('categories/d').locationIds=['b1'];await assert.rejects(f.api.mutateLocationCatalog('categories','d','orderfly.catalog:edit',()=>({locationIds:['a1']})),/forbidden/);assert.deepEqual(f.writes,[]);
});
test('create cannot overwrite and an edit cannot create a missing category',async()=>{
 const f=fixture('orderfly.catalog:create');await assert.rejects(f.api.mutateLocationCatalog('categories','d','orderfly.catalog:create',()=>({locationIds:['a1']})),/record_exists/);
 await assert.rejects(f.api.mutateLocationCatalog('categories','new','orderfly.catalog:edit',()=>({locationIds:['a1']})),/record_missing/);
 await assert.rejects(f.api.mutateLocationCatalog('categories','../outside','orderfly.catalog:create',()=>({locationIds:['a1']})),/invalid_identifier/);assert.deepEqual(f.writes,[]);
});
test('reorder rejects the entire batch when any row belongs to another company',async()=>{
 const f=fixture();f.records.set('categories/foreign',{locationIds:['b1']});await assert.rejects(f.api.reorderLocationCatalog('categories',[{id:'d',sortOrder:0},{id:'foreign',sortOrder:1}]),/forbidden/);assert.deepEqual(f.writes,[]);
});
