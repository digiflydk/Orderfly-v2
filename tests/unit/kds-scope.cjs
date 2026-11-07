const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const identity={provider:'firebase',subject:'operator'};
const {principalKey,AuthorityError}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
function fixture({host='esmeralda.orderfly.dk',superuser=true,active=true,edit=true,foreign=false,duplicate=false}={}){
 const reads=[]; const principal=principalKey(identity);
 const policy={principals:[{id:principal,active}],companies:[{id:'c1',active:true,orderflyBrandIds:['b1'],locationIds:['l1']}],roles:[{id:'r1',name:'Role',kind:superuser?'superuser':'company_user',companyId:superuser?null:'c1',active:true,permissions:['orderfly.orders:view',...(edit?['orderfly.orders:edit']:[])]}],memberships:[{id:'m1',principalId:principal,roleIds:['r1'],active:true,companyId:superuser?null:'c1',locationIds:null}]};
 const snap=(id,data)=>({id,exists:!!data,data:()=>data});
 function collection(name,filters=[],limit){return {name,filters,limitValue:limit,where:(...p)=>collection(name,[...filters,p],limit),limit:n=>collection(name,filters,n),doc:id=>({name,id})};}
 const db={collection,runTransaction:async fn=>fn({get:async q=>{
  reads.push(q);
  if(q.name==='platformAdminControl')return snap('access-v1',policy);
  if(q.name==='brands')return {docs:q.filters[0][2]==='esmeralda'?[snap('b1',{slug:'esmeralda',name:'Esmeralda'}),...(duplicate?[snap('b2',{slug:'esmeralda'})]:[])]:[]};
  assert.equal(q.name,'locations');assert.deepEqual(q.filters,[['brandId','==','b1']]);assert.equal(q.limitValue,201);
  return {docs:[snap('l1',{brandId:foreign?'b2':'b1',name:'Amager'})]};
 }})};
 const mocks={'server-only':{},'next/headers':{headers:async()=>new Headers({host})},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>identity}};
 return {...loadTs('src/lib/orders/kds-scope.ts',mocks),reads,policy,mocks};
}
test('superadmin KDS resolves only hostname brand and its native locations',async()=>{
 const f=fixture(),scope=await f.resolveKdsScope();
 assert.deepEqual(scope.locations,[{brandId:'b1',locationId:'l1',brandName:'Esmeralda',locationName:'Amager'}]);assert.deepEqual(scope.editableLocationIds,['l1']);assert.equal(f.reads.length,3);
});
test('employee gets only granted view, and every request sees revocation',async()=>{
 const f=fixture({superuser:false,edit:false});assert.deepEqual((await f.resolveKdsScope()).editableLocationIds,[]);
 f.policy.principals[0].active=false;await assert.rejects(f.resolveKdsScope(),e=>e.status===403);
});
test('unknown/root hosts, ambiguous brands and foreign native ownership fail closed',async()=>{
 for(const options of [{host:'orderfly.dk'},{host:'other.orderfly.dk'},{host:'example.org'},{duplicate:true},{foreign:true},{active:false}]) await assert.rejects(fixture(options).resolveKdsScope(),e=>e.status===403);
});
test('KDS route never accepts client authority context and returns auth failure without reading orders',async()=>{
 let reads=0;const mocks={'@/lib/access/authority':{AuthorityError},'@/lib/orders/kds-scope':{resolveKdsScope:async()=>{throw new AuthorityError('expired',401);}},'@/lib/orders/terminal-read':{TerminalReadError:class extends Error{},readTerminalOrders:async()=>{reads++;}}};
 const {GET}=loadTs('src/app/api/kds/orders/route.ts',mocks);
 const response=await GET(new Request('https://esmeralda.orderfly.dk/api/kds/orders'));
 assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,0);
 const duplicate=await GET(new Request('https://esmeralda.orderfly.dk/api/kds/orders?brandId=b1&brandId=b2'));assert.equal(duplicate.status,400);
});
