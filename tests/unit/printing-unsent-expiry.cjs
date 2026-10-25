const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {printJobId}=loadTs('src/lib/printing/domain.ts');
const scope={brandId:'b',locationId:'l',printerId:'p'}, epoch='A'.repeat(43), now=1_000_000;
function fixture(count=1,extra={}){
 const root='locations/l/printers/p', records=new Map(), writes=[];
 const doc=path=>({path,id:path.split('/').at(-1),collection:name=>collection(path+'/'+name)});
 const collection=(path,limit=Infinity)=>({path,limit:n=>collection(path,n),doc:id=>doc(path+'/'+id),query:true,max:limit});
 const snap=path=>({id:path.split('/').at(-1),exists:records.has(path),data:()=>structuredClone(records.get(path))});
 const transaction={async get(ref){assert.equal(writes.length,0,'all reads must precede writes');if(!ref.query)return snap(ref.path);const docs=[...records.keys()].filter(p=>p.startsWith(ref.path+'/')&&!p.slice(ref.path.length+1).includes('/')).slice(0,ref.max).map(snap);return {docs,size:docs.length};},create:(ref,data)=>writes.push(['create',ref.path,data]),delete:ref=>writes.push(['delete',ref.path]),set:(ref,data)=>writes.push(['set',ref.path,data])};
 const db={collection}, jobs=[];
 for(let i=0;i<count;i++){const job={schemaVersion:1,...scope,orderId:'ORD-'+i,kind:'kitchen',revision:0,printerRevision:1,state:'queued',attempts:0,createdAt:now-400_000+i,updatedAt:null,automaticActivationId:epoch,...extra};job.id=printJobId(job);jobs.push(job);records.set(root+'/jobs/'+job.id,job);}
 records.set(root+'/queue/state',{schemaVersion:1,...scope,revision:1,pendingCount:count,oldestPendingAt:count?Math.min(...jobs.map(j=>j.createdAt)):null,updatedAt:null});
 const api=loadTs('src/lib/printing/unsent-print-expiry.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>({timestamp:true})}}});
 const cleanup=loadTs('src/lib/printing/expired-offer-cleanup.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>({timestamp:true})}}});
 return{api,records,writes,jobs,root,cleanup:(time=now)=>cleanup.prepareExpiredOfferCleanup({db,transaction},scope,time),run:()=>api.prepareUnsentPrintExpiry({db,transaction},scope,{automaticActivationId:epoch,issuedAt:100_000},now)};
}
test('archives proven unsent timed-out job with audit metadata and atomic ledger update',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.count,1);assert.equal(f.writes.length,0);result.apply();assert.equal(f.writes.length,3);
 const [archive,deleted,ledger]=f.writes;assert.equal(archive[0],'create');assert.ok(archive[1].includes('/expiredPrintJobs/'));assert.equal(archive[2].reason,'unsent_timeout');assert.ok(f.api.storedExpiredPrintJobSchema.safeParse(archive[2]).success);assert.equal(archive[2].completedAt,now);assert.equal(deleted[0],'delete');assert.equal(ledger[2].pendingCount,0);assert.equal(ledger[2].oldestPendingAt,null);assert.equal(ledger[2].revision,2);assert.throws(()=>result.apply());
});
test('fresh current activation is retained; previous and legacy activation expire without replay',async()=>{
 for(const activation of [epoch,'B'.repeat(43),undefined]){const f=fixture(1,{createdAt:now-1000,automaticActivationId:activation}),result=await f.run();assert.equal(result.count,activation===epoch?0:1);result.apply();if(result.count)assert.equal(f.writes[0][2].reason,'activation_changed');else assert.equal(f.writes.length,0);}
});
test('execution evidence or delivery pointers prevent destructive archival',async()=>{
 for(const collection of ['claims','ordinaryDispatches','originalPrintHistory','deliveries','printResults','expiredPrintJobs','ordinaryState','manualState']){const f=fixture(),id=collection.endsWith('State')?'current':f.jobs[0].id;f.records.set(f.root+'/'+collection+'/'+id,{});const result=await f.run();assert.equal(result.count,0,collection);result.apply();assert.equal(f.writes.length,0);}
});
test('batch is bounded to 101 writes and keeps exact remaining oldest/count',async()=>{
 const f=fixture(500),result=await f.run();assert.equal(result.count,50);result.apply();assert.equal(f.writes.length,101);const ledger=f.writes.at(-1)[2];assert.equal(ledger.pendingCount,450);assert.equal(ledger.oldestPendingAt,f.jobs[50].createdAt);
});
test('invalid ledger, future job, foreign scope and queue overflow fail without writes',async()=>{
 const cases=[f=>f.records.get(f.root+'/queue/state').pendingCount=2,f=>f.records.get(f.root+'/queue/state').revision=Number.MAX_SAFE_INTEGER,f=>f.records.get(f.root+'/jobs/'+f.jobs[0].id).createdAt=now+1,f=>f.records.get(f.root+'/jobs/'+f.jobs[0].id).brandId='foreign'];
 for(const mutate of cases){const f=fixture();mutate(f);await assert.rejects(f.run(),/unsent_print_expiry_unverified/);assert.equal(f.writes.length,0);}
 const f=fixture(501);await assert.rejects(f.run(),/unsent_print_expiry_unverified/);assert.equal(f.writes.length,0);
});
function offerFixture(){
 const f=fixture(),job=f.jobs[0],{updatedAt,...canonical}=job;
 const dispatch={schemaVersion:1,...scope,jobId:job.id,job:canonical,printerRevision:1,credentialRevision:1,qualificationId:'old',state:'offered',claimDigest:'a'.repeat(64),deliveryDigest:'b'.repeat(64),contentDigest:'c'.repeat(64),payloadBase64:'a'.repeat(12),byteLength:8,model:'mc-print3',paperWidthMm:80,offeredAt:now-60000,expiresAt:now,downloadedAt:null,completedAt:null};
 f.records.set(f.root+'/ordinaryState/current',{schemaVersion:1,jobId:job.id});f.records.set(f.root+'/ordinaryDispatches/'+job.id,dispatch);
 f.records.set(f.root+'/claims/'+job.id,{schemaVersion:1,...scope,jobId:job.id,state:'reserved',job:canonical,printerRevision:1,credentialRevision:1,attemptNumber:1,claimDigest:dispatch.claimDigest,deliveryDigest:dispatch.deliveryDigest,reservedAt:dispatch.offeredAt,expiresAt:now});
 return f;
}
test('expired untouched offer clears pointer atomically without removing forensic records or replaying',async()=>{
 const f=offerFixture(),result=await f.cleanup();assert.equal(result.count,1);assert.equal(f.writes.length,0);result.apply();assert.equal(f.writes.length,4);
 assert.equal(f.writes[0][2].reason,'offer_timeout');assert.equal(f.writes[0][2].printerRevision,1);assert.equal(f.writes[0][2].automaticActivationId,epoch);assert.ok(f.api.storedExpiredPrintJobSchema.safeParse(f.writes[0][2]).success);
 assert.equal(f.writes.at(-1)[2].pendingCount,0);assert.equal(f.writes.some(([,path])=>path.includes('/claims/')||path.includes('/ordinaryDispatches/')||path.includes('/ordinaryTokens/')),false);
 for(const [type,path,data]of f.writes){if(type==='delete')f.records.delete(path);else f.records.set(path,data);}f.writes.length=0;
 assert.equal((await f.cleanup()).count,0);assert.equal(f.writes.length,0);
});
test('cleanup waits for both offer and claim expiry boundaries',async()=>{
 const f=offerFixture();assert.equal((await f.cleanup(now-1)).count,0);assert.equal(f.writes.length,0);
 f.records.get(f.root+'/claims/'+f.jobs[0].id).reservedAt++;f.records.get(f.root+'/claims/'+f.jobs[0].id).expiresAt++;
 await assert.rejects(f.cleanup(),/unsent_print_expiry_unverified/);assert.equal(f.writes.length,0);
 assert.equal((await f.cleanup(now+1)).count,1);
});
test('downloaded, delivered, completed and ambiguous evidence never clears pointer',async()=>{
 for(const collection of ['deliveries','originalPrintHistory','printResults','expiredPrintJobs','manualState']){const f=offerFixture();f.records.set(f.root+'/'+collection+'/'+(collection==='manualState'?'current':f.jobs[0].id),{});assert.equal((await f.cleanup()).count,0,collection);assert.equal(f.writes.length,0);}
 for(const state of ['download_started','confirmed','failed','unknown']){const f=offerFixture(),row=f.records.get(f.root+'/ordinaryDispatches/'+f.jobs[0].id);row.state=state;row.downloadedAt=now-1000;if(state!=='download_started')row.completedAt=now;assert.equal((await f.cleanup()).count,0);assert.equal(f.writes.length,0);}
 const malformed=offerFixture();malformed.records.get(malformed.root+'/ordinaryDispatches/'+malformed.jobs[0].id).downloadedAt=now-1000;await assert.rejects(malformed.cleanup());assert.equal(malformed.writes.length,0);
});
test('mismatched queued activation, claim revision/digests, pointer and ledger fail closed',async()=>{
 const mutations=[f=>f.records.get(f.root+'/jobs/'+f.jobs[0].id).automaticActivationId='B'.repeat(43),f=>f.records.get(f.root+'/claims/'+f.jobs[0].id).credentialRevision=2,f=>f.records.get(f.root+'/claims/'+f.jobs[0].id).claimDigest='d'.repeat(64),f=>f.records.get(f.root+'/ordinaryState/current').jobId='e'.repeat(64),f=>f.records.get(f.root+'/queue/state').pendingCount=2];
 for(const mutate of mutations){const f=offerFixture();mutate(f);await assert.rejects(f.cleanup());assert.equal(f.writes.length,0);}
});
