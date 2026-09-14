const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const identity={provider:'firebase',subject:'employee'};
function fixture(permission='orderfly.discounts:edit',locations=null){
 const records=new Map([
  ['brands/a',{}],['brands/b',{}],['locations/a1',{brandId:'a'}],['locations/b1',{brandId:'b'}],
  ['discounts/d',{brandId:'a',locationIds:['a1'],code:'OLD'}],
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
 const api=loadTs('src/lib/access/scoped-data.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./orderfly-session':{verifiedOrderflyIdentity:async()=>identity}});
 return{api,records,writes};
}
test('current permission authorizes an employee mutation without native admin status',async()=>{
 const f=fixture();await f.api.mutateScopedDocument('discounts','d','orderfly.discounts:edit','locations',before=>({...before,code:'NEW'}));
 assert.equal(f.records.get('discounts/d').code,'NEW');assert.equal(f.writes.length,1);
});
test('revoked and view-only permissions cannot mutate records',async()=>{
 for(const revoke of [false,true]){
  const f=fixture(revoke?'orderfly.discounts:edit':'orderfly.discounts:view');
  if(revoke)f.records.get('platformAdminControl/access-v1').memberships[0].active=false;
  await assert.rejects(f.api.mutateScopedDocument('discounts','d','orderfly.discounts:edit','locations',before=>({...before,code:'NEW'})),/forbidden/);assert.deepEqual(f.writes,[]);
 }
});
test('scope must cover both stored and resulting ownership and native locations',async()=>{
 for(const after of [{brandId:'b',locationIds:['b1']},{brandId:'a',locationIds:['b1']},{brandId:'a',locationIds:[]}]){
  const f=fixture('orderfly.discounts:edit',['a1']);
  await assert.rejects(f.api.mutateScopedDocument('discounts','d','orderfly.discounts:edit','locations',before=>({...before,...after})),/forbidden/);assert.deepEqual(f.writes,[]);
 }
});
test('create cannot overwrite, edit cannot create, and injected document paths are rejected',async()=>{
 const f=fixture('orderfly.discounts:create');
 await assert.rejects(f.api.mutateScopedDocument('discounts','d','orderfly.discounts:create','locations',()=>({brandId:'a'})),/record_exists/);
 await assert.rejects(f.api.mutateScopedDocument('discounts','new','orderfly.discounts:edit','locations',()=>({brandId:'a'})),/record_missing/);
 await assert.rejects(f.api.mutateScopedDocument('discounts','../foreign','orderfly.discounts:create','locations',()=>({brandId:'a'})),/invalid_identifier/);
 assert.deepEqual(f.writes,[]);
});
test('mutations commit no writes if subsequent validation fails',async()=>{
 const f=fixture();await assert.rejects(f.api.mutateScopedDocument('discounts','d','orderfly.discounts:edit','locations',()=>{throw Error('duplicate code');}),/duplicate code/);assert.deepEqual(f.writes,[]);
});
