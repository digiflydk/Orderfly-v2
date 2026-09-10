const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(t){
 const reads=[],records=new Map();let ready=true;
 const db={projectId:'orderfly-39325',collection:name=>query(name)};
 function query(name,filters=[],limit=Infinity){return {where:(...args)=>query(name,[...filters,args],limit),limit:n=>query(name,filters,n),get:async()=>{
   reads.push({name,filters,limit});
   const docs=[...records].filter(([key,v])=>key.startsWith(name+'/')&&filters.every(([field,,value])=>(field==='__name__'?key.slice(name.length+1):v[field])===value)).slice(0,limit).map(([,value])=>({data:()=>value}));return{docs};
 }};}
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminApp:()=>({options:{projectId:db.projectId}}),admin:{firestore:{FieldPath:{documentId:()=>'__name__'}}}},'@/lib/feedback/mail-config':{notificationPlatformConfig:()=>ready?{}:null}};
 const lib=loadTs('src/lib/integrations/order-mail-diagnostics.ts',mocks),input={...lib.ESMERALDA_MAIL_SCOPE,order_id:'ORD-416719'};
 const before=process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID;
 process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID=input.organization_id;t.after(()=>before===undefined?delete process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID=before);
 const jobId=createHash('sha256').update(JSON.stringify(['order-confirmation',input.brand_id,input.order_id])).digest('hex');
 records.set('orders/'+input.order_id,{brandId:input.brand_id,locationId:'loc',paymentStatus:'Paid',status:'Received',customerContact:'private@example.test'});
 const job={brandId:input.brand_id,locationId:'loc',orderId:input.order_id,state:'uncertain',attempts:1,lastError:'provider_result_unknown',updatedAt:1,nextAttemptAt:Number.MAX_SAFE_INTEGER};
 return{lib,input,reads,records,db,job,jobKey:'orderNotificationJobs/'+jobId,mocks,setReady:v=>ready=v};
}
test('missing job and uncertain/accepted job are distinct; no recipient, token or raw errors leak',async t=>{
 const f=fixture(t);assert.equal((await f.lib.readOrderMailStatus(f.input)).job,null);
 f.records.set(f.jobKey,{...f.job,secret:'never-return',lastError:'private@example.test Bearer private-secret'});
 const result=await f.lib.readOrderMailStatus(f.input);assert.equal(result.job.state,'uncertain');assert.equal(result.job.last_error,'unknown_error');assert.equal(result.job.next_attempt_at,null);
 assert.doesNotMatch(JSON.stringify(result),/private|never-return/);
 f.records.get(f.jobKey).state='accepted';assert.equal((await f.lib.readOrderMailStatus(f.input)).job.state,'accepted');
 for(const read of f.reads){assert.ok(read.filters.some(([k,,v])=>k==='brandId'&&v===f.input.brand_id));assert.equal(read.limit,1);}
});
test('wrong scope, database and missing organization configuration fail closed before business reads',async t=>{
 const f=fixture(t);
 for(const input of [{...f.input,brand_id:'foreign'},{...f.input,organization_id:'foreign'},{...f.input,order_id:'../secret'},{...f.input,extra:true}])assert.equal(f.lib.mailStatusInput.safeParse(input).success,false);
 f.db.projectId='orderfly-v21-10334086-b3076';assert.equal((await f.lib.readOrderMailStatus(f.input)).error,'data_project_mismatch');assert.equal(f.reads.length,0);
 f.db.projectId='orderfly-39325';delete process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID;assert.equal((await f.lib.readOrderMailStatus(f.input)).error,'organization_configuration_mismatch');assert.equal(f.reads.length,0);
});
test('foreign order and corrupt job scope never disclose state',async t=>{
 const f=fixture(t);f.records.get('orders/'+f.input.order_id).brandId='foreign';assert.equal((await f.lib.readOrderMailStatus(f.input)).error,'order_not_found');
 f.records.get('orders/'+f.input.order_id).brandId=f.input.brand_id;f.records.set(f.jobKey,{...f.job,locationId:'foreign'});
 assert.equal((await f.lib.readOrderMailStatus(f.input)).error,'job_scope_mismatch');
});
test('eligibility and configuration explain stopped mail without mutating the order',async t=>{
 const f=fixture(t),order=f.records.get('orders/'+f.input.order_id);
 for(const [patch,want]of [[{paymentStatus:'Pending'},'unpaid'],[{paymentStatus:'Paid',status:'Canceled'},'canceled'],[{status:'Received',customerContact:''},'invalid_email']]){Object.assign(order,patch);assert.equal((await f.lib.readOrderMailStatus(f.input)).eligibility,want);}
 f.setReady(false);assert.equal((await f.lib.readOrderMailStatus(f.input)).configuration.notification_ready,false);
});
test('HTTP route authenticates before reads and sanitizes unavailable diagnostics',async t=>{
 const f=fixture(t);let allowed=false,calls=0,fail=false;
 const route=loadTs('src/app/api/integrations/esmeralda/notifications/status/route.ts',{
  '@/lib/integrations/esmeralda-customer-contract':{isValidMachineSecret:()=>allowed},
  '@/lib/integrations/order-mail-diagnostics':{mailStatusInput:f.lib.mailStatusInput,readOrderMailStatus:async input=>{calls++;if(fail)throw Error('private credential');return f.lib.readOrderMailStatus(input);}}
 });
 const invoke=body=>route.POST(new Request('https://orderfly.test',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await invoke(f.input)).status,401);assert.equal(calls,0);allowed=true;
 assert.equal((await invoke({...f.input,brand_id:'foreign'})).status,400);assert.equal(calls,0);
 const ok=await invoke(f.input);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
 fail=true;const bad=await invoke(f.input);assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/private credential/);
});
