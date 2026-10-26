const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(){
 const rows=new Map(),identity={provider:'firebase',subject:'owner'},actor=hash(['firebase','owner']);let authorized=true,secretCalls=0,providerCalls=0,registration='registered',connection=true,tail=Promise.resolve();const creates=[];
 const ref=path=>({path,id:path.split('/').pop(),collection:name=>collection(`${path}/${name}`)});
 const collection=path=>({path,doc:id=>ref(`${path}/${id}`),orderBy(){return query(path)},where(...args){return query(path).where(...args)}});
 function query(path,filters=[],after=null,max=50){return {isQuery:true,path,filters,after,max,where:(...f)=>query(path,[...filters,f],after,max),orderBy:()=>query(path,filters,after,max),startAfter:v=>query(path,filters,v,max),limit:v=>query(path,filters,after,v)};}
 const snap=(path,state)=>({id:path.split('/').pop(),exists:state.has(path),data:()=>structuredClone(state.get(path))});
 const db={collection,doc:ref,runTransaction(run){const task=tail.then(async()=>{const state=new Map([...rows].map(([k,v])=>[k,structuredClone(v)]));let wrote=false;
  const tx={get:async r=>{assert.equal(wrote,false,'all transaction reads must precede writes');if(r.isQuery){const docs=[...state.keys()].filter(k=>k.startsWith(r.path+'/')&&k.split('/').length===r.path.split('/').length+1).sort().filter(k=>(!r.after||k.split('/').pop()>r.after)&&r.filters.every(([field,op,v])=>op==='=='&&state.get(k)[field]===v)).slice(0,r.max).map(k=>snap(k,state));return {docs};}return snap(r.path,state);},set:(r,v)=>{wrote=true;state.set(r.path,structuredClone(v));},create:(r,v)=>{wrote=true;if(state.has(r.path))throw Error('already exists');state.set(r.path,structuredClone(v));}};
  const result=await run(tx);rows.clear();for(const [k,v]of state)rows.set(k,v);return result;});tail=task.catch(()=>{});return task;}};
 rows.set('platformAdminControl/access-v1',{principals:[{id:actor,active:true,name:'Owner'}],companies:[],roles:[{id:'owner-role',name:'Owner',companyId:null,kind:'superuser',permissions:[],active:true}],memberships:[{id:'owner-membership',principalId:actor,companyId:null,locationIds:null,roleIds:['owner-role'],active:true}]});
 rows.set('brands/b',{id:'b'});rows.set('locations/l',{id:'l',brandId:'b'});rows.set('locations/l2',{id:'l2',brandId:'b'});
 const modules={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!authorized){throw new (load('src/lib/access/authority.ts').AuthorityError)('unauthorized',401);}return {identity,superuser:true};}},'@/lib/url':{getOrigin:async()=>'https://orderfly.dk'},
 '@/lib/delivery/management/platform':{loadGeoapifyPlatformInTransaction:async tx=>(await tx.get(ref('deliveryPlatformConfigs/geoapify'))).data()||null},
 '@/lib/delivery/settings/server':{loadDeliverySettingsInTransaction:async tx=>({result:{settings:(await tx.get(ref('settings/test'))).data()}})},
 '@/lib/delivery/management/secrets':{provisionDeliveryMerchantSecrets:async x=>{secretCalls++;return {api:x.apiKey?`projects/project-test/secrets/orderfly-wolt-${x.environment}-${x.merchantId}/versions/1`:x.existing.api,webhook:x.webhookSigningSecret||x.apiKey?`projects/project-test/secrets/orderfly-wolt-webhook-${x.environment}-${x.merchantId}/versions/1`:x.existing.webhook};}},
 '@/lib/delivery/management/wolt':{verifyWoltMerchantConnection:async()=>{providerCalls++;return connection;},ensureWoltMerchantCallback:async x=>{providerCalls++;creates.push(x.allowCreate);if(x.allowCreate)await x.beforeCreate();return registration==='registered'?{status:'registered',webhookId:'hook1'}:{status:'unknown'};}}};
 modules['./platform']=modules['@/lib/delivery/management/platform'];modules['./secrets']=modules['@/lib/delivery/management/secrets'];modules['./wolt']=modules['@/lib/delivery/management/wolt'];modules['../settings/server']=modules['@/lib/delivery/settings/server'];
 const load=moduleGraph(modules),service=load('src/lib/delivery/management/service.ts'),schema=load('src/lib/delivery/management/schema.ts');
 const input={brandId:'b',locationId:'l',environment:'sandbox',displayName:'Test merchant',merchantId:'merchant1',venueId:'venue1',pickupContact:{name:'Test pickup',phone:'+4520717786',verifiedAt:'2026-10-26T10:00:00Z'}};
 const action=async(row,action,extra={})=>(await service.actOnDeliveryMerchant(row.id,{action,expectedRevision:row.revision,...(action==='activate'?{pickupVenueConfirmed:true}:{}),...extra})).merchant;
 async function ready(extra={}){let row=(await service.createDeliveryMerchant({...input,...extra,credentials:{apiKey:'never-return-this-test-key'}})).merchant;row=await action(row,'test');row=await action(row,'register_callback');rows.set('deliveryPlatformConfigs/geoapify',{enabled:true,retentionApproved:true,secretRef:'private-ref',routingApprovalRef:'approved',retentionApprovalRef:'approved'});rows.set('settings/test',{enabled:true,paused:false,providerId:'wolt',pricingRules:{configured:true}});return row;}
 return {service,schema,load,rows,input,action,ready,counts:()=>({secretCalls,providerCalls}),creates,authorize:v=>authorized=v,registration:v=>registration=v,connection:v=>connection=v};
}

test('draft CRUD is available without cloud credentials and DTO/audit never reveal secrets',async()=>{
 const f=fixture();let row=(await f.service.createDeliveryMerchant(f.input)).merchant;assert.equal(row.status,'draft');assert.equal(f.counts().secretCalls,0);assert.deepEqual(row.credentials,{apiConfigured:false,webhookConfigured:false});
 const saved=f.rows.get(`deliveryMerchantEnrollments/${row.id}`);assert.ok(saved.callbackKey);assert.equal(JSON.stringify(row).includes(saved.callbackKey),false);
 row=(await f.service.updateDeliveryMerchant(row.id,{displayName:'Changed',merchantId:row.merchantId,venueId:row.venueId,pickupContact:row.pickupContact,expectedRevision:row.revision})).merchant;assert.equal(row.displayName,'Changed');assert.equal(f.counts().secretCalls,0);
 const audit=[...f.rows].filter(([k])=>k.includes('/audit/'));assert.equal(audit.length,2);assert.equal(JSON.stringify(audit).includes(saved.callbackKey),false);
 const list=await f.service.listDeliveryMerchants({brandId:'b',locationId:'l'});assert.equal(list.merchants.length,1);
});

test('create/update CAS, exact scope and superuser transaction authorization reject before effects',async()=>{
 const f=fixture(),row=(await f.service.createDeliveryMerchant(f.input)).merchant;
 await assert.rejects(f.service.createDeliveryMerchant(f.input),/record_conflict/);
 await assert.rejects(f.service.updateDeliveryMerchant(row.id,{displayName:'Changed',merchantId:row.merchantId,venueId:row.venueId,pickupContact:row.pickupContact,expectedRevision:0,credentials:{apiKey:'never-use-this-key'}}),/record_conflict/);assert.equal(f.counts().secretCalls,0);
 f.rows.set('locations/foreign',{brandId:'another'});await assert.rejects(f.service.createDeliveryMerchant({...f.input,locationId:'foreign'}),/forbidden/);
 const policy=f.rows.get('platformAdminControl/access-v1');policy.principals[0].active=false;
 await assert.rejects(f.service.getDeliveryMerchant(row.id),/forbidden/);assert.equal(f.counts().providerCalls,0);
});

test('connection, registration and activation provision exact native records; deactivate/archive preserve recovery',async()=>{
 const f=fixture();let row=await f.ready();assert.equal(row.connectionStatus,'verified');assert.equal(row.callbackStatus,'registered');
 row=await f.action(row,'activate');assert.equal(row.status,'active');const key=hash(['b','l']);assert.equal(f.rows.get(`deliveryAdoptions/${key}`).mode,'managed');assert.equal(f.rows.get(`deliveryRuntimeConfigs/${key}`).environment,'sandbox');
 const nativeBefore=JSON.stringify([...f.rows].filter(([k])=>/^delivery(Provider|Wolt|Adoptions|Runtime)/.test(k)));
 row=await f.action(row,'deactivate');assert.equal(row.status,'inactive');row=await f.action(row,'delete');assert.equal(row.status,'archived');assert.equal((await f.service.listDeliveryMerchants({})).merchants.length,0);
 assert.equal(JSON.stringify([...f.rows].filter(([k])=>/^delivery(Provider|Wolt|Adoptions|Runtime)/.test(k))),nativeBefore);
 const raw=JSON.stringify(row);assert.equal(raw.includes('never-return'),false);assert.equal(raw.includes('projects/project-test'),false);
});

test('canonical merchant ownership conflict rejects second venue before subscription creation',async()=>{
 const f=fixture();await f.ready();let other=(await f.service.createDeliveryMerchant({...f.input,locationId:'l2',venueId:'venue2',credentials:{apiKey:'another-long-test-key'}})).merchant;other=await f.action(other,'test');const before=f.counts().providerCalls;
 await assert.rejects(f.action(other,'register_callback'),/merchant_scope_conflict/);assert.equal(f.counts().providerCalls,before);
});

test('unknown registration is durable and subsequent attempt only lists, never blindly creates',async()=>{
 const f=fixture();f.registration('unknown');let row=await f.ready();assert.equal(row.callbackStatus,'unknown');assert.equal(row.operationPending,false);assert.deepEqual(f.creates,[true]);
 f.registration('registered');row=await f.action(row,'register_callback');assert.equal(row.callbackStatus,'registered');assert.deepEqual(f.creates,[true,false]);
});

test('provisioned identity and credentials cannot rotate underneath historical orders',async()=>{
 const f=fixture(),row=await f.ready();const before=f.counts().secretCalls;
 await assert.rejects(f.service.updateDeliveryMerchant(row.id,{displayName:row.displayName,merchantId:row.merchantId,venueId:row.venueId,pickupContact:row.pickupContact,expectedRevision:row.revision,credentials:{apiKey:'replacement-test-secret'}}),/merchant_binding_locked/);
 await assert.rejects(f.service.updateDeliveryMerchant(row.id,{displayName:row.displayName,merchantId:'other',venueId:row.venueId,pickupContact:row.pickupContact,expectedRevision:row.revision}),/merchant_binding_locked/);assert.equal(f.counts().secretCalls,before);
});

test('activation requires scoped settings/routing readiness and explicit production approval',async()=>{
 const f=fixture();let row=await f.ready();f.rows.set('settings/test',{enabled:false,paused:false,providerId:'wolt',pricingRules:{}});await assert.rejects(f.action(row,'activate'),/delivery_settings_not_ready/);
 f.rows.set('settings/test',{enabled:true,paused:false,providerId:'wolt',pricingRules:{}});f.rows.delete('deliveryPlatformConfigs/geoapify');await assert.rejects(f.action(row,'activate'),/routing_not_ready/);
 const p=fixture();let prod=await p.ready({environment:'production'});await assert.rejects(p.action(prod,'activate'),/production_approval_required/);prod=await p.action(prod,'activate',{productionApproved:true});assert.equal(prod.productionApproved,true);
});


test('HTTP requires real superuser session, same-origin JSON and bounded strict commands',async()=>{
 const f=fixture(),http=f.load('src/lib/delivery/management/http.ts');
 const request=(body,headers={})=>new Request('https://orderfly.dk/api/delivery/merchants',{method:'POST',headers:{origin:'https://orderfly.dk','content-type':'application/json',...headers},body:JSON.stringify(body)});
 f.authorize(false);assert.equal((await http.merchantCollection(request(f.input))).status,401);f.authorize(true);
 assert.equal((await http.merchantCollection(request(f.input,{origin:'https://foreign.example'}))).status,403);
 assert.equal((await http.merchantCollection(request({...f.input,secretRef:'projects/attacker'}))).status,400);
 assert.equal((await http.merchantCollection(request({...f.input,displayName:'x'.repeat(17000)}))).status,400);
 assert.equal((await http.merchantCollection(new Request('https://orderfly.dk/api/delivery/merchants?brandId=b&brandId=b'))).status,400);
 const response=await http.merchantCollection(request(f.input));assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
 const dto=(await response.json()).merchant;assert.equal(dto.credentials.apiConfigured,false);
 const policy=f.rows.get('platformAdminControl/access-v1');policy.principals[0].active=false;
 assert.equal((await http.merchantItem(new Request('https://orderfly.dk/api/delivery/merchants/'+dto.id),dto.id)).status,403);
});

test('only one environment can be active for the same location',async()=>{
 const f=fixture();let sandbox=await f.ready();sandbox=await f.action(sandbox,'activate');let production=await f.ready({environment:'production'});
 await assert.rejects(f.action(production,'activate',{productionApproved:true}),/environment_conflict/);
 assert.equal(f.rows.get('deliveryRuntimeConfigs/'+hash(['b','l'])).environment,'sandbox');
});

test('archived merchants can be found and explicitly restored with CAS without losing bindings',async()=>{
 const f=fixture();let row=await f.ready();row=await f.action(row,'delete');assert.equal((await f.service.listDeliveryMerchants({})).merchants.length,0);
 assert.equal((await f.service.listDeliveryMerchants({includeArchived:'true'})).merchants[0].status,'archived');
 const nativeBefore=JSON.stringify([...f.rows].filter(([k])=>/^delivery(Provider|Wolt)/.test(k)));
 await assert.rejects(f.service.actOnDeliveryMerchant(row.id,{action:'restore',expectedRevision:row.revision-1}),/record_conflict/);
 row=await f.action(row,'restore');assert.equal(row.status,'inactive');assert.equal(row.credentials.apiConfigured,true);assert.equal((await f.service.listDeliveryMerchants({})).merchants.length,1);
 assert.equal(JSON.stringify([...f.rows].filter(([k])=>/^delivery(Provider|Wolt)/.test(k))),nativeBefore);
});

test('uncertain provider registration never prevents stopping new orders',async()=>{
 const f=fixture();let row=await f.ready();row=await f.action(row,'activate');f.registration('unknown');row=await f.action(row,'register_callback');assert.equal(row.callbackStatus,'unknown');
 row=await f.action(row,'deactivate');assert.equal(row.status,'inactive');assert.equal(f.rows.get('deliveryMerchantEnrollments/'+row.id).operation.state,'unknown');
 const native=f.rows.get('deliveryProviderBindings/'+hash(['b','l','wolt','sandbox']));assert.equal(native.active,true);
});

test('short webhook signing secrets reject before any credential or native writes',async()=>{
 const f=fixture();
 for(const length of [16,31])await assert.rejects(f.service.createDeliveryMerchant({...f.input,credentials:{apiKey:'valid-api-key-123456',webhookSigningSecret:'w'.repeat(length)}}));
 assert.equal(f.counts().secretCalls,0);assert.equal([...f.rows.keys()].some(key=>key.startsWith('deliveryMerchantEnrollments/')),false);
 const row=(await f.service.createDeliveryMerchant({...f.input,credentials:{apiKey:'valid-api-key-123456',webhookSigningSecret:'w'.repeat(32)}})).merchant;
 assert.equal(row.credentials.webhookConfigured,true);assert.equal(f.counts().secretCalls,1);
 await assert.rejects(f.service.updateDeliveryMerchant(row.id,{displayName:row.displayName,merchantId:row.merchantId,venueId:row.venueId,pickupContact:row.pickupContact,expectedRevision:row.revision,credentials:{webhookSigningSecret:'w'.repeat(31)}}));
 assert.equal(f.counts().secretCalls,1);
});


test('activation needs an explicit operator pickup/venue address attestation and audits it',async()=>{
 const f=fixture(),row=await f.ready();
 for(const extra of [{},{pickupVenueConfirmed:false}])await assert.rejects(f.service.actOnDeliveryMerchant(row.id,{action:'activate',expectedRevision:row.revision,...extra}),/pickup_venue_confirmation_required/);
 assert.equal(f.rows.has('deliveryAdoptions/'+hash(['b','l'])),false);
 const activated=await f.action(row,'activate');
 const audit=f.rows.get(`deliveryMerchantEnrollments/${row.id}/audit/${activated.revision}`);
 assert.equal(audit.pickupVenueConfirmed,true);assert.equal(audit.action,'merchant.activate');assert.equal('providerVerifiedAddress'in audit,false);
});
