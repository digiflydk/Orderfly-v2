const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const lifetime={openings:7,probableScans:5,excludedOpenings:2,firstOpenedAt:1,lastOpenedAt:2};
async function workspace(analyticsLocations,values=[lifetime],superuser=false){
 const snap=(id,data)=>({id,exists:true,data:()=>data});
 const db={collection(name){return {doc(id){return {get:async()=>snap(id,name==='brands'?{name:'Own'}:{brandId:'own',isActive:true})};},where(){return this;},limit(){return this;},get:async()=>({docs:name==='brands'?[snap('own',{})]:[snap('loc',{brandId:'own',isActive:true})]})};}};
 class AuthorityError extends Error{constructor(code,status=403){super(code);this.status=status;}}
 const runtime=loadTs('src/lib/qr/runtime.ts',{
  'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/authority':{AuthorityError},
  '@/lib/access/orderfly-session':{orderflySession:async()=>({actorId:'actor',superuser}),requireOrderflyAccess:async()=>{},orderflyReadGrants:async permission=>{
   if(permission.endsWith(':analytics'))return analyticsLocations===undefined?[]:[{brandId:'own',locationIds:analyticsLocations}];
   return [{brandId:'own',locationIds:['loc']}];
  }},
  './store':{QrStoreError:class extends Error{},createQrStore:()=>({list:async()=>({truncated:false,rows:values.map((value,i)=>({id:'code'+i,brandId:'own',locationId:'loc',lifetime:value}))})})},
  './admin':{qrSummary:row=>({id:row.id,brandId:row.brandId}),createQrAdminService:()=>{}},
 });
 return runtime.loadQrWorkspace();
}
test('whole-code counters require a current brand-wide analytics grant, even with catalogue access',async()=>{
 for(const grant of [undefined,[],['loc']])assert.deepEqual((await workspace(grant)).allTime,{});
 assert.deepEqual((await workspace(null)).allTime,{'own/code0':lifetime});
});
test('missing, null or corrupt saved counters remain unknown rather than fabricated zero',async()=>{
 const result=await workspace(null,[undefined,null,{...lifetime,openings:8}]);
 assert.deepEqual(result.allTime,{'own/code0':null,'own/code1':null,'own/code2':null});
});
test('history transport requires native view and exact current stored location before audit I/O',async()=>{
 for(const mode of ['denied','moved','allowed']){
  let queries=0;
  class AuthorityError extends Error{constructor(code,status=403){super(code);this.status=status;}}
  const runtime=loadTs('src/lib/qr/runtime.ts',{
   'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/access/authority':{AuthorityError},
   '@/lib/access/orderfly-session':{orderflySession:async()=>({actorId:'actor',superuser:false}),
    requireOrderflyAccess:async(brand,locations,permission)=>{assert.equal(brand,'own');assert.deepEqual(locations,['loc']);assert.equal(permission,'orderfly.qr_codes:view');if(mode==='denied')throw new AuthorityError('forbidden');},
    orderflyReadGrants:async()=>[{brandId:'own',locationIds:['loc']}]},
   './store':{QrStoreError:class extends Error{},createQrStore:()=>({get:async()=>({id:'code',brandId:'own',locationId:mode==='moved'?'other':'loc'})})},
   './history':{createQrHistoryService:(_db,{getCode})=>({read:async(scope,id)=>{await getCode(scope,id);queries++;return {rows:[],truncated:false,discarded:0};}})},
  });
  const call=()=>runtime.executeQrCommand({action:'history',brandId:'own',locationId:'loc',id:'code'});
  if(mode==='allowed'){assert.deepEqual(await call(),{rows:[],truncated:false,discarded:0});assert.equal(queries,1);}
  else{await assert.rejects(call);assert.equal(queries,0);}
 }
});
test('brand-wide bulk preview accepts only active native locations of the authorized brand',async()=>{
 const previous=process.env.QR_MODULE_ENABLED;process.env.QR_MODULE_ENABLED='true';
 try{
  const trace=[];
  const db={collection(name){assert.equal(name,'locations');return {where(field,op,value){trace.push([field,op,value]);return this;},limit(n){assert.equal(n,501);return this;},get:async()=>({docs:[['loc',{brandId:'own',isActive:true}],['inactive',{brandId:'own',isActive:false}],['foreign',{brandId:'other',isActive:true}]].map(([id,data])=>({id,data:()=>data}))})};}};
  const runtime=loadTs('src/lib/qr/runtime.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
   '@/lib/access/orderfly-session':{orderflySession:async()=>({actorId:'actor',superuser:true}),requireOrderflyAccess:async(brand,locations,permission)=>{assert.equal(brand,'own');assert.equal(locations,null);assert.equal(permission,'orderfly.qr_codes:create');}},
  });
  const preview=location=>runtime.executeQrCommand({action:'bulk_preview',brandId:'own',csv:`name,destination,brand_id,location_id\nMenu,https://example.com/,own,${location}`});
  assert.equal((await preview('loc')).ok,true);
  for(const id of ['inactive','foreign','missing'])assert.equal((await preview(id)).ok,false);
  assert.ok(trace.every(([field,op,value])=>field==='brandId'&&op==='=='&&value==='own'));
 }finally{if(previous===undefined)delete process.env.QR_MODULE_ENABLED;else process.env.QR_MODULE_ENABLED=previous;}
});

test('code analytics eligibility preserves brand and current location grants independently of lifetime access',async()=>{
 for(const grant of [undefined,[],['other']])assert.deepEqual((await workspace(grant)).analyticsCodeKeys,[]);
 for(const grant of [null,['loc']])assert.deepEqual((await workspace(grant)).analyticsCodeKeys,['own/code0']);
 assert.deepEqual((await workspace(undefined,[lifetime],true)).analyticsCodeKeys,['own/code0']);
});
