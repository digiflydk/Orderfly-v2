const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const {createQrBulkStore}=loadTs('src/lib/qr/bulk-store.ts');
const {previewQrCsv}=loadTs('src/lib/qr/bulk.ts');
class Database {
 rows=new Map();tail=Promise.resolve();writeCount=0;failAt=Infinity;
 collection(prefix){const db=this;return {doc(id){const path=prefix+'/'+id;return {path,collection:suffix=>db.collection(path+'/'+suffix)};}};}
 snapshot(path,value){return {id:path.split('/').at(-1),exists:value!==undefined,data:()=>value===undefined?undefined:structuredClone(value)};}
 async runTransaction(body){const previous=this.tail;let release;this.tail=new Promise(r=>release=r);await previous;
  const next=new Map(this.rows);let writes=0;
  try{const result=await body({get:async ref=>{assert.equal(writes,0,'all reads before first write');return this.snapshot(ref.path,next.get(ref.path));},
   create:(ref,value)=>{writes++;if(writes===this.failAt)throw Error('injected failure');if(next.has(ref.path))throw Error('already_exists');next.set(ref.path,structuredClone(value));},
   set:()=>{throw Error('unexpected overwrite');}});this.rows=next;this.writeCount+=writes;return result;
  }finally{release();}}
}
const scope={brandId:'brandA',locationIds:null,actorId:'actorA'};
const requestId='00000000-0000-4000-8000-000000000001';
function command(lines=['A,https://example.org/a,brandA,locA','B,https://example.org/b,brandA,']){
 const preview=previewQrCsv('name,destination,brand_id,location_id\n'+lines.join('\n'),{allowedScopes:[{brandId:'brandA',locationIds:['locA'],allowBrandWide:true},{brandId:'brandB',locationIds:['locB'],allowBrandWide:true}]});
 assert.ok(preview.ok,JSON.stringify(preview.errors));const canonical=preview.plan.canonical;return {canonical,sha256:createHash('sha256').update(canonical).digest('hex'),requestId};
}
function fixture(){const db=new Database();db.rows.set('brands/brandA',{status:'active'});db.rows.set('brands/brandB',{status:'active'});db.rows.set('locations/locA',{brandId:'brandA',isActive:true});db.rows.set('locations/locB',{brandId:'brandB',isActive:true});
 let serial=0,allowed=true;const calls=[];
 const store=createQrBulkStore(db,{now:()=>10000,newId:()=>(++serial).toString(16).padStart(32,'0'),authorizeCreate:async(s,loc)=>{calls.push([s.actorId,s.brandId,loc]);if(!allowed)throw Object.assign(Error('forbidden'),{code:'forbidden'});}});
 return {db,store,calls,revoke:()=>{allowed=false;}};
}
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);

test('single transaction creates all native records, minimal indexes, audit and one receipt; replay writes nothing',async()=>{
 const {db,store,calls}=fixture();const input=command();const result=await store.create(scope,input);
 assert.equal(result.records.length,2);assert.equal(db.writeCount,7);assert.equal(calls.length,2);
 for(const row of result.records){assert.equal(row.status,'active');assert.equal(row.expiresAt,null);assert.equal(row.revision,1);
  assert.deepEqual(db.rows.get('qrPublicCodes/'+row.slug),{brandId:'brandA',codeId:row.id});assert.equal(db.rows.get(`brands/brandA/qrCodes/${row.id}/audit/${requestId}`).action,'bulk-create');}
 const before=[...db.rows];assert.deepEqual(await store.create(scope,input),result);assert.deepEqual([...db.rows],before);assert.equal(db.writeCount,7);assert.equal(calls.length,4);
});
test('lost-response retry and concurrent identical requests return the same batch',async()=>{
 const {db,store}=fixture();const input=command();const [a,b]=await Promise.all([store.create(scope,input),store.create(scope,input)]);
 assert.deepEqual(a,b);assert.equal(db.writeCount,7);
});
test('same request UUID with changed plan or actor conflicts',async()=>{
 const {db,store}=fixture();await store.create(scope,command());const before=[...db.rows];
 await rejects(()=>store.create(scope,command(['Changed,https://example.org/a,brandA,locA'])),'request_conflict');
 await rejects(()=>store.create({...scope,actorId:'other'},command()),'request_conflict');assert.deepEqual([...db.rows],before);
});
test('native permission revocation, narrower scope, inactive/moved location and deleted brand block replay',async()=>{
 const f=fixture(),input=command();await f.store.create(scope,input);f.revoke();await rejects(()=>f.store.create(scope,input),'forbidden');
 const g=fixture();await g.store.create(scope,input);await rejects(()=>g.store.create({...scope,locationIds:['locA']},input),'invalid_bulk_plan');
 g.db.rows.set('locations/locA',{brandId:'brandB',isActive:true});await rejects(()=>g.store.create(scope,input),'invalid_location');
 g.db.rows.set('locations/locA',{brandId:'brandA',isActive:false});await rejects(()=>g.store.create(scope,input),'invalid_location');
 g.db.rows.set('locations/locA',{brandId:'brandA',isActive:true});g.db.rows.delete('brands/brandA');await rejects(()=>g.store.create(scope,input),'not_found');
});
test('multi-brand, foreign location, browser-like extra scope fields, altered digest and unsafe rows fail before writes',async()=>{
 const {db,store}=fixture();const before=[...db.rows];
 await rejects(()=>store.create(scope,command(['A,https://example.org,brandB,locB'])),'forbidden');
 await rejects(()=>store.create(scope,command(['A,https://example.org/a,brandA,locA','B,https://example.org/b,brandB,locB'])),'forbidden');
 const input=command();await rejects(()=>store.create(scope,{...input,sha256:'0'.repeat(64)}),'plan_mismatch');
 await rejects(()=>store.create(scope,{...input,allowedScopes:[]}),'invalid_bulk_command');
 const plan=JSON.parse(input.canonical);plan.entries[0].destination='https://orderfly.dk./q/loop';
 const canonical=JSON.stringify(plan);await rejects(()=>store.create(scope,{canonical,sha256:createHash('sha256').update(canonical).digest('hex'),requestId}),'invalid_bulk_plan');
 plan.entries[0].destination='https://example.org/';plan.entries[0].locationId='locB';const foreign=JSON.stringify(plan);
 await rejects(()=>store.create(scope,{canonical:foreign,sha256:createHash('sha256').update(foreign).digest('hex'),requestId}),'invalid_location');
 assert.deepEqual([...db.rows],before);assert.equal(db.writeCount,0);
});
test('injected transaction failure rolls every staged write back; retry completes once',async()=>{
 const {db,store}=fixture();const before=[...db.rows];db.failAt=5;await assert.rejects(()=>store.create(scope,command()),/injected failure/);
 assert.deepEqual([...db.rows],before);assert.equal(db.writeCount,0);db.failAt=Infinity;await store.create(scope,command());assert.equal(db.writeCount,7);
});
test('existing global slug or local record collision aborts entire batch and keeps history',async()=>{
 const {db,store}=fixture();db.rows.set('qrPublicCodes/'+'2'.padStart(32,'0'),{brandId:'brandB',codeId:'other'});const before=[...db.rows];
 await rejects(()=>store.create(scope,command()),'id_collision');assert.deepEqual([...db.rows],before);
 const f=fixture();f.db.rows.set('brands/brandA/qrCodes/'+'1'.padStart(32,'0'),{id:'existing'});await rejects(()=>f.store.create(scope,command()),'id_collision');
});
test('100 rows are one bounded transaction, 101 rows and duplicate names have no plan',async()=>{
 const {db,store}=fixture();const input=command(Array.from({length:100},(_,i)=>`Name${i},https://example.org/${i},brandA,locA`));
 assert.equal((await store.create(scope,input)).records.length,100);assert.equal(db.writeCount,301);
 const plan=JSON.parse(input.canonical);plan.entries.push(plan.entries[0]);const canonical=JSON.stringify(plan);
 await rejects(()=>store.create(scope,{canonical,sha256:createHash('sha256').update(canonical).digest('hex'),requestId:'00000000-0000-4000-8000-000000000002'}),'invalid_bulk_plan');
 assert.equal(previewQrCsv('name,destination,brand_id\nSame,https://example.org,brandA\nSame,https://example.org,brandA',{allowedScopes:[{brandId:'brandA',locationIds:[],allowBrandWide:true}]}).plan,null);
});
test('trusted authorization adapter is required and colliding IDs never partially commit',async()=>{
 const {db}=fixture();assert.throws(()=>createQrBulkStore(db,{}),error=>error.code==='missing_authorization_adapter');
 const store=createQrBulkStore(db,{now:()=>10000,newId:()=>'a'.repeat(32),authorizeCreate:async()=>{}});
 await rejects(()=>store.create(scope,command()),'id_collision');assert.equal(db.writeCount,0);
});
test('a request UUID already used by another QR operation conflicts without overwriting its receipt',async()=>{
 const {db,store}=fixture();db.rows.set(`brands/brandA/qrRequests/${requestId}`,{signature:'different-action-signature',result:{id:'old'},createdAt:10});
 const before=[...db.rows];await rejects(()=>store.create(scope,command()),'request_conflict');assert.deepEqual([...db.rows],before);assert.equal(db.writeCount,0);
});
test('receipt replay also rechecks current QR scope after an administrator moves a code',async()=>{
 const f=fixture(),input=command(['A,https://example.org/a,brandA,locA']);const restricted={...scope,locationIds:['locA']};
 const created=await f.store.create(restricted,input),path=`brands/brandA/qrCodes/${created.records[0].id}`;
 f.db.rows.set('locations/locC',{brandId:'brandA',isActive:true});f.db.rows.set(path,{...f.db.rows.get(path),locationId:'locC'});
 await rejects(()=>f.store.create(restricted,input),'forbidden');
 const replay=await f.store.create(scope,input);assert.deepEqual(replay,created);assert.ok(f.calls.some(call=>call[2]==='locC'));
 f.db.rows.set('locations/locC',{brandId:'brandB',isActive:true});await rejects(()=>f.store.create(scope,input),'invalid_location');
});
