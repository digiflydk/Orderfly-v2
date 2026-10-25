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
  const p = record(); p.configuration.state = 'active';
  const credential = { schemaVersion: 1, brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1,
    credentialRevision: 1, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null };
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, p], [`${path}/deviceCredentials/current`, credential],
    ['orders/ORD-1', { brandId: 'brand', locationId: 'location', status: 'Completed', paymentStatus:'Paid', deliveryType:'Pickup', total: 100 }]]);
  const options = {}, writes = []; let renders = 0;
  const collection = path => ({doc:id=>ref(`${path}/${id}`),orderBy:()=>({query:path,limit:n=>({query:path,count:n,startAfter:after=>({query:path,count:n,after})})})});
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`) });
  const db = { collection, async runTransaction(run) {
    const staged = new Map(structuredClone([...records])), commit = []; let writing = false;
    const put = (r,v,create) => { writing = true; if (create) assert.equal(staged.has(r.path), false);
      if (options.failAudit && r.path.includes('/manualPrintAudit/')) throw Error('audit failure');
      staged.set(r.path,structuredClone(v)); commit.push(r.path); };
    const result = await run({ get: async r => { assert.equal(writing,false,'reads precede writes');
      if(r.query){assert.equal(r.count,51);return {docs:[...staged].filter(([p])=>p.startsWith(r.query+'/')&&!p.slice(r.query.length+1).includes('/')&&(!r.after||p.split('/').at(-1)>r.after)).sort().slice(0,r.count).map(([p,v])=>({id:p.split('/').at(-1),data:()=>structuredClone(v),ref:ref(p)}))};}
      return {id:r.id,exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))}; },
      create:(r,v)=>put(r,v,true),set:(r,v)=>put(r,v,false) });
    records.clear(); for(const row of staged) records.set(...row); writes.push(...commit); return result;
  } };
  const payload = Buffer.from('89504e470d0a1a0a'+'00'.repeat(16),'hex'), digest = createHash('sha256').update(payload).digest('hex');
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb:()=>db }, '@/lib/access/authority':authority,
    './authority':authority, '@/lib/access/orderfly-session':{orderflySession:async()=>({identity:{provider:'firebase',subject:'writer'}}),requirePlatformSuperuser:async()=>{
      if(options.denied) throw new authority.AuthorityError('forbidden');
      return {identity:{provider:'firebase',subject:'writer'}};
    }}, '@/lib/url': {getOrigin:async()=> 'https://orderfly.dk'},
    './receipt-print-content': {prepareReceiptPrintContent:async input=>{renders++; if(options.render) options.render(records);
      assert.deepEqual(input,{orderId:command.orderId,brandId:command.brandId,locationId:command.locationId,printerId:command.printerId,kind:input.kind});
      return {payload,sha256:options.invalidDigest ? 'f'.repeat(64):digest}; }}};
  const api=loadTs('src/lib/printing/manual-print-request.ts',mocks);
  const http=loadTs('src/lib/printing/merchant-reprint-http.ts',mocks);
  const list=loadTs('src/lib/printing/merchant-reprint.ts',mocks);
  return {records,options,writes,api,http,list,get renders(){return renders;}};
}
async function enabled(run) {
  const flags=['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED','ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED'];
  const old=flags.map(x=>process.env[x]), clock=Date.now; flags.forEach(x=>process.env[x]='true'); Date.now=()=>now;
  try {await run();} finally {flags.forEach((x,i)=>old[i]===undefined?delete process.env[x]:process.env[x]=old[i]);Date.now=clock;}
}

test('ordinary merchant can explicitly enqueue own accepted order but original superadmin service remains restricted',()=>enabled(async()=>{
 const f=fixture(); assert.equal((await f.api.requestMerchantPrint(command)).state,'queued');
 assert.equal(f.renders,1); assert.equal(f.writes.length,3);
 await assert.rejects(f.api.requestManualPrint({...command,requestId:secondId}),e=>e.status===403);
}));
test('merchant fresh policy revocation, foreign location/order and pending online rejection',()=>enabled(async()=>{
 for(const change of [r=>r.get('platformAdminControl/access-v1').principals[0].active=false,
 r=>r.get('orders/ORD-1').brandId='foreign', r=>r.get('locations/location').brandId='foreign',
 r=>Object.assign(r.get('orders/ORD-1'),{status:'Pending',paymentStatus:'Pending',paymentMethod:'Stripe'})]){
 const f=fixture();change(f.records);await assert.rejects(f.api.requestMerchantPrint(command));assert.equal(f.writes.length,0);assert.equal(f.renders,0);
 }
 const f=fixture();f.options.render=r=>r.get('platformAdminControl/access-v1').roles[0].permissions=[];
 await assert.rejects(f.api.requestMerchantPrint(command));assert.equal(f.writes.length,0);
}));
test('accepted unpaid pickup may print kitchen without recording payment; unknown dispatch never creates another job',()=>enabled(async()=>{
 const f=fixture();Object.assign(f.records.get('orders/ORD-1'),{status:'Received',paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'});
 const a=await f.api.requestMerchantPrint(command);assert.deepEqual(await f.api.requestMerchantPrint(command),a);
 assert.equal(f.records.get('orders/ORD-1').paymentStatus,'Pending');assert.equal(f.renders,1);
 Object.assign(f.records.get(`${path}/manualPrintRequests/${command.requestId}`),{state:'unknown',offeredAt:now,downloadedAt:now,completedAt:now,tokenDigest:'a'.repeat(64)});
 assert.equal((await f.api.readMerchantPrint(command)).state,'unknown');
 await assert.rejects(f.api.requestMerchantPrint({...command,requestId:secondId}));assert.equal(f.writes.length,3);
}));
test('minimal scoped list is read-only, strips credentials and hides ineligible printers',()=>enabled(async()=>{
 const f=fixture(), scope={orderId:'ORD-1',brandId:'brand',locationId:'location'};
 const result=await f.list.listMerchantReprintPrinters(scope);
 assert.equal(result.items.length,1);assert.equal(result.nextCursor,null);
 assert.equal(JSON.stringify(result).includes('secretDigest'),false);assert.equal(f.writes.length,0);
 f.records.get(`${path}/deviceCredentials/current`).revokedAt=now;
 assert.equal((await f.list.listMerchantReprintPrinters(scope)).items.length,0);
 f.records.get('orders/ORD-1').brandId='foreign';await assert.rejects(f.list.listMerchantReprintPrinters(scope));
}));
test('merchant HTTP validates origin, strict list/commands and duplicate query keys',()=>enabled(async()=>{
 const f=fixture(), base='https://orderfly.dk/api/merchant/orders/reprint';
 const post=(body,origin='https://orderfly.dk')=>new Request(base,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await f.http.handleMerchantReprint(post(command,'https://evil.test'))).status,403);
 assert.equal((await f.http.handleMerchantReprint(post({...command,admin:true}))).status,400);
 assert.equal((await f.http.handleMerchantReprint(new Request(base+'?orderId=ORD-1&brandId=brand&locationId=location&orderId=ORD-2'))).status,400);
 const list=await f.http.handleMerchantReprint(new Request(base+'?orderId=ORD-1&brandId=brand&locationId=location'));
 assert.equal(list.status,200);assert.equal(f.writes.length,0);
 assert.equal((await f.http.handleMerchantReprint(post(command))).status,200);
}));
test('merchant audit failure rolls back and a printer revision change invalidates frozen render',()=>enabled(async()=>{
 for(const mode of ['audit','revision']){const f=fixture();if(mode==='audit')f.options.failAudit=true;
 else f.options.render=r=>r.get(path).revision=2;
 await assert.rejects(f.api.requestMerchantPrint(command));assert.equal(f.writes.length,0);assert.equal(f.records.has(`${path}/manualState/current`),false);}
}));
test('merchant picker pages bounded raw documents including filtered devices without exposing foreign records',()=>enabled(async()=>{
 const f=fixture(),scope={orderId:'ORD-1',brandId:'brand',locationId:'location'};
 for(let i=0;i<55;i++){const id=`p${String(i+10).padStart(3,'0')}`,row=record();row.configuration={...row.configuration,id,state:'disabled'};f.records.set(`locations/location/printers/${id}`,row);}
 const first=await f.list.listMerchantReprintPrinters(scope);assert.ok(first.nextCursor);assert.equal(first.items.length,0);
 const next=await f.list.listMerchantReprintPrinters({...scope,after:first.nextCursor});assert.equal(next.nextCursor,null);assert.equal(next.items.length,1);assert.equal(next.items[0].configuration.id,'p1');
 f.records.get('platformAdminControl/access-v1').memberships[0].locationIds=['other'];
 await assert.rejects(f.list.listMerchantReprintPrinters(scope));
}));
test('saved merchant job remains readable and idempotent after an accepted pickup is canceled',()=>enabled(async()=>{
 const f=fixture();Object.assign(f.records.get('orders/ORD-1'),{status:'Received',paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'});
 const first=await f.api.requestMerchantPrint(command);Object.assign(f.records.get('orders/ORD-1'),{status:'Canceled',discountReservation:'released'});
 assert.deepEqual(await f.api.readMerchantPrint(command),first);assert.deepEqual(await f.api.requestMerchantPrint(command),first);
 await assert.rejects(f.api.requestMerchantPrint({...command,requestId:secondId}));assert.equal(f.writes.length,3);
}));
