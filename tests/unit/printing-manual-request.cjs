const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const now = 1_800_000_000_000;
const command = { orderId: 'ORD-1', brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1,
  kind: 'kitchen', requestId: 'b3f864b4-20c7-4ed1-b2d8-819bdfed4bb0' };
const secondId = 'b3f864b4-20c7-4ed1-b2d8-819bdfed4bb1';
function fixture() {
  const policy = basePolicy(['orderfly.orders:edit']);
  policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const p = record(); p.configuration.state = 'active';
  const credential = { schemaVersion: 1, brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1,
    credentialRevision: 1, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null };
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, p], [`${path}/deviceCredentials/current`, credential],
    ['orders/ORD-1', { brandId: 'brand', locationId: 'location', status: 'Completed', total: 100 }]]);
  const options = {}, writes = []; let renders = 0;
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    const staged = new Map(structuredClone([...records])), commit = []; let writing = false;
    const put = (r,v,create) => { writing = true; if (create) assert.equal(staged.has(r.path), false);
      if (options.failAudit && r.path.includes('/manualPrintAudit/')) throw Error('audit failure');
      staged.set(r.path,structuredClone(v)); commit.push(r.path); };
    const result = await run({ get: async r => { assert.equal(writing,false,'reads precede writes');
      return {id:r.id,exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))}; },
      create:(r,v)=>put(r,v,true),set:(r,v)=>put(r,v,false) });
    records.clear(); for(const row of staged) records.set(...row); writes.push(...commit); return result;
  } };
  const payload = Buffer.from('89504e470d0a1a0a'+'00'.repeat(16),'hex'), digest = createHash('sha256').update(payload).digest('hex');
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb:()=>db }, '@/lib/access/authority':authority,
    './authority':authority, '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{
      if(options.denied) throw new authority.AuthorityError('forbidden');
      return {identity:{provider:'firebase',subject:'writer'}};
    }}, '@/lib/url': {getOrigin:async()=> 'https://orderfly.dk'},
    './receipt-print-content': {prepareReceiptPrintContent:async input=>{renders++; if(options.render) options.render(records);
      assert.deepEqual(input,{orderId:command.orderId,brandId:command.brandId,locationId:command.locationId,printerId:command.printerId,kind:input.kind});
      return {payload,sha256:options.invalidDigest ? 'f'.repeat(64):digest}; }}};
  const api=loadTs('src/lib/printing/manual-print-request.ts',mocks);
  const http=loadTs('src/lib/printing/manual-print-control-http.ts',mocks);
  return {records,options,writes,api,http,get renders(){return renders;}};
}
async function enabled(run) {
  const flags=['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED','ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED'];
  const old=flags.map(x=>process.env[x]), clock=Date.now; flags.forEach(x=>process.env[x]='true'); Date.now=()=>now;
  try {await run();} finally {flags.forEach((x,i)=>old[i]===undefined?delete process.env[x]:process.env[x]=old[i]);Date.now=clock;}
}
test('manual customer and kitchen copies freeze bytes, audit actor and never modify original jobs',()=>enabled(async()=>{
  for(const kind of ['kitchen','customer']) {const f=fixture(); const result=await f.api.requestManualPrint({...command,kind});
    assert.equal(result.state,'queued');assert.equal(result.expiresAt-now,600000);assert.equal('payloadBase64' in result,false);
    assert.equal(f.records.get(`${path}/manualPrintRequests/${command.requestId}`).actorId,actorId);
    assert.deepEqual(f.writes.sort(),[`${path}/manualPrintRequests/${command.requestId}`,`${path}/manualPrintAudit/${command.requestId}`,`${path}/manualState/current`].sort());
  }
}));
test('same request returns same job without rendering or writes; changed kind conflicts',()=>enabled(async()=>{
 const f=fixture();const first=await f.api.requestManualPrint(command);const count=f.writes.length;
 assert.deepEqual(await f.api.requestManualPrint(command),first);assert.equal(f.renders,1);assert.equal(f.writes.length,count);
 await assert.rejects(f.api.requestManualPrint({...command,kind:'customer'}),e=>e.code==='manual_print_conflict');
}));
test('scope mismatch or policy revocation rejects before rendering',()=>enabled(async()=>{
 for(const mutate of [f=>f.options.denied=true,f=>f.records.get('orders/ORD-1').brandId='other',f=>f.records.get('locations/location').brandId='other',f=>f.records.get('platformAdminControl/access-v1').roles=f.records.get('platformAdminControl/access-v1').roles.filter(r=>r.id!=='owner')]) {
 const f=fixture();mutate(f);await assert.rejects(f.api.requestManualPrint(command));assert.equal(f.renders,0);assert.equal(f.writes.length,0);}
}));
test('changed order, printer or credentials during rendering prevent committing stale content',()=>enabled(async()=>{
 for(const mutate of [r=>r.get('orders/ORD-1').total=200,r=>r.get(path).configuration.name='changed',r=>r.get(`${path}/deviceCredentials/current`).credentialRevision=2,r=>r.get(`${path}/deviceCredentials/current`).revokedAt=now]){
 const f=fixture();f.options.render=mutate;await assert.rejects(f.api.requestManualPrint(command));assert.equal(f.writes.length,0);}
}));
test('audit failure rolls back job and pointer; invalid PNG digest never enqueues',()=>enabled(async()=>{
 for(const key of ['failAudit','invalidDigest']){const f=fixture();f.options[key]=true;await assert.rejects(f.api.requestManualPrint(command));assert.equal(f.records.has(`${path}/manualState/current`),false);}
}));
test('ordinary occupied or ambiguous prior manual dispatch blocks new copies',()=>enabled(async()=>{
 const f=fixture();f.records.set(`${path}/ordinaryState/current`,{schemaVersion:1,jobId:'a'.repeat(64)});await assert.rejects(f.api.requestManualPrint(command));assert.equal(f.writes.length,0);
 f.records.delete(`${path}/ordinaryState/current`);await f.api.requestManualPrint(command);
 const row=f.records.get(`${path}/manualPrintRequests/${command.requestId}`);Object.assign(row,{state:'unknown',offeredAt:now,downloadedAt:now,completedAt:now,tokenDigest:'c'.repeat(64)});
 await assert.rejects(f.api.requestManualPrint({...command,requestId:secondId}));
 f.records.get(`${path}/manualPrintRequests/${command.requestId}`).state='confirmed';f.records.get(`${path}/manualPrintRequests/${command.requestId}`).completedAt=now;assert.equal((await f.api.requestManualPrint({...command,requestId:secondId})).state,'queued');
}));
test('read projects uncertainty without returning bytes or mutating history',()=>enabled(async()=>{
 const f=fixture();await f.api.requestManualPrint(command);const row=f.records.get(`${path}/manualPrintRequests/${command.requestId}`);
 row.createdAt=now-600001;row.expiresAt=now-1;Object.assign(row,{state:'download_started',offeredAt:now-600000,downloadedAt:now-599999,tokenDigest:'c'.repeat(64)});const count=f.writes.length;
 const result=await f.api.readManualPrint(command);assert.equal(result.state,'unknown');assert.equal(f.writes.length,count);assert.equal('sha256'in result,false);
}));
test('HTTP rejects CSRF, excessive/unknown inputs and duplicate query keys before writes',()=>enabled(async()=>{
 const f=fixture(); const post=(body,origin='https://orderfly.dk')=>new Request('https://orderfly.dk/api/superadmin/printers/reprint',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await f.http.handleManualPrintControl(post(command,'https://evil.example'))).status,403);
 assert.equal((await f.http.handleManualPrintControl(post({...command,payload:'malicious'}))).status,400);
 assert.equal((await f.http.handleManualPrintControl(post({...command,requestId:'not-uuid'}))).status,400);
 const q=new URLSearchParams({...command,printerRevision:'1'});q.append('orderId','OTHER');
 assert.equal((await f.http.handleManualPrintControl(new Request(`https://orderfly.dk/api/superadmin/printers/reprint?${q}`))).status,400);
 assert.equal(f.writes.length,0);
 const response=await f.http.handleManualPrintControl(post(command));assert.equal(response.status,200);assert.equal((await response.json()).state,'queued');
}));

test('permission revoked while rendering and disabled gate never enqueue',()=>enabled(async()=>{
 const f=fixture();f.options.render=r=>r.get('platformAdminControl/access-v1').principals[0].active=false;
 await assert.rejects(f.api.requestManualPrint(command));assert.equal(f.writes.length,0);
 const g=fixture();process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED='false';
 await assert.rejects(g.api.requestManualPrint(command),e=>e.code==='manual_print_unavailable');assert.equal(g.renders,0);
}));

test('impossible terminal states and non-monotonic transport timestamps fail closed',()=>enabled(async()=>{
 for(const patch of [{state:'confirmed'},{state:'failed'},{state:'unknown'},{state:'expired',downloadedAt:now,completedAt:now},
   {state:'offered',offeredAt:now,tokenDigest:null},
   {state:'confirmed',offeredAt:now,downloadedAt:now-1,completedAt:now,tokenDigest:'c'.repeat(64)}]) {
   const f=fixture();await f.api.requestManualPrint(command);Object.assign(f.records.get(`${path}/manualPrintRequests/${command.requestId}`),patch);
   const count=f.writes.length;await assert.rejects(f.api.requestManualPrint({...command,requestId:secondId}),e=>e.code==='manual_print_conflict');
   await assert.rejects(f.api.readManualPrint(command),e=>e.code==='manual_print_conflict');assert.equal(f.writes.length,count);
 }
}));
test('undownloaded expiry may be recorded later than its deadline and permits explicit new copy',()=>enabled(async()=>{
 for(const offered of [false,true]) {const f=fixture();await f.api.requestManualPrint(command);
   const row=f.records.get(`${path}/manualPrintRequests/${command.requestId}`);
   Object.assign(row,{createdAt:now-700000,expiresAt:now-100000,state:'expired',completedAt:now});
   if(offered) Object.assign(row,{offeredAt:now-699000,tokenDigest:'c'.repeat(64)});
   assert.equal((await f.api.requestManualPrint({...command,requestId:secondId})).state,'queued');
 }
}));
