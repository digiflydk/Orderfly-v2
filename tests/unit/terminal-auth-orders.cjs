const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {createTerminalAuthFixture,seedTerminalAdmin}=require('../helpers/terminal-auth-fixture.cjs');
const order=(extra={})=>({brandId:'brand',locationId:'location',brandName:'Fixture',locationName:'Fixture',status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',deliveryType:'Pickup',totalAmount:100,createdAt:new Date('2026-10-25T20:00:00Z'),customerName:'Synthetic customer',customerContact:'fixture@example.invalid',customerDetails:{id:'customer',address:'For Pickup'},paymentDetails:{subtotal:100,discountTotal:0,deliveryFee:0},productItems:[{id:'pizza',name:'Pizza',itemType:'product',quantity:1,unitPrice:100,totalPrice:100}],...extra});
async function fixture(run){const f=createTerminalAuthFixture();seedTerminalAdmin(f);return f.withClock(async()=>{
 const core=f.load('src/lib/terminal-auth/core.ts'),secret=randomBytes(24).toString('base64url');
 await core.updateTerminalLoginConfig('location',{username:'fixture.location',password:secret,enabled:true,expectedRevision:0});
 const issued=await core.loginTerminal({username:'fixture.location',password:secret});f.cookies.set(core.TERMINAL_COOKIE,issued.token);f.cookies.delete('__session');
 f.rows.set('orders/ORD-1',order());f.rows.set('orders/ORD-FOREIGN',order({locationId:'other'}));f.rows.set('customers/customer',{brandId:'brand',totalOrders:0,totalSpend:0});
 f.mocks['@/lib/analytics-server']={trackServerEvent:async()=>{}};f.mocks['@/lib/marketing/config']={paidOrderMarketingEnabled:()=>false};
 f.mocks['next/cache']={revalidatePath:()=>{},revalidateTag:()=>{}};
 await run({f,core,issued});
});}
const command=(extra={})=>({orderId:'ORD-1',brandId:'brand',locationId:'location',expectedStatus:'Received',status:'In Progress',requestId:randomUUID(),...extra});

test('dedicated terminal reads own location only; existing merchant endpoint cannot use terminal cookie',()=>fixture(async({f})=>{
 const read=f.load('src/lib/orders/terminal-read.ts');
 const result=await read.readTerminalOrders({},new Date(f.now),'terminal');assert.deepEqual(result.orders.map(o=>o.id),['ORD-1']);assert.equal(result.locations.length,1);assert.equal(result.canEdit,true);
 assert.ok(f.reads.filter(r=>typeof r==='object'&&r.collection==='orders').every(r=>r.filters.some(([key,op,v])=>key==='locationId'&&op==='=='&&v==='location')));
 await assert.rejects(read.readTerminalOrders({brandId:'brand',locationId:'other'},new Date(f.now),'terminal'),e=>[401,403].includes(e.status));
 await assert.rejects(read.readTerminalOrders({},new Date(f.now)),e=>e.status===401);
}));
test('terminal progression preserves payment gate and foreign scope denial',()=>fixture(async({f})=>{
 const api=f.load('src/lib/orders/terminal-status.ts');
 await api.progressTerminalOrder(command(),'terminal');assert.equal(f.rows.get('orders/ORD-1').status,'In Progress');
 await assert.rejects(api.progressTerminalOrder(command({orderId:'ORD-FOREIGN',locationId:'other'}),'terminal'),e=>e.status===401);
 f.rows.set('orders/ORD-1',order({status:'Ready',paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
 await assert.rejects(api.progressTerminalOrder(command({expectedStatus:'Ready',status:'Completed'}),'terminal'),e=>e.code==='terminal_payment_required');
 assert.equal(f.rows.get('orders/ORD-1').paymentStatus,'Pending');assert.equal(f.rows.get('orders/ORD-1').status,'Ready');
 await assert.rejects(api.progressTerminalOrder(command()),e=>e.status===401);
}));
test('credential revision revoked on status transaction retry prevents status and audit commit',()=>fixture(async({f})=>{
 const api=f.load('src/lib/orders/terminal-status.ts'),before=f.rows.size;
 f.options.retry=rows=>{rows.get('terminalCredentials/location').revision++;};
 await assert.rejects(api.progressTerminalOrder(command(),'terminal'),e=>e.status===401);
 assert.equal(f.rows.get('orders/ORD-1').status,'Received');assert.equal(f.rows.size,before);
}));
test('both cookies never expand terminal scope, and a revoked terminal session never falls back to admin',()=>fixture(async({f,core})=>{
 seedTerminalAdmin(f);f.rows.get('platformAdminControl/access-v1').memberships[0].locationIds=['location','other'];
 const read=f.load('src/lib/orders/terminal-read.ts');
 await assert.rejects(read.readTerminalOrders({brandId:'brand',locationId:'other'},new Date(f.now),'terminal'),e=>[401,403].includes(e.status));
 assert.equal((await read.readTerminalOrders({brandId:'brand',locationId:'other'},new Date(f.now))).orders[0].id,'ORD-FOREIGN');
 f.rows.get('terminalCredentials/location').enabled=false;
 await assert.rejects(read.readTerminalOrders({},new Date(f.now),'terminal'),e=>e.status===401);
 assert.equal((await read.readTerminalOrders({},new Date(f.now))).canEdit,true);
}));
function seedPrinter(f){const path='locations/location/printers/p1';f.rows.set(path,{schemaVersion:1,configuration:{id:'p1',brandId:'brand',locationId:'location',name:'Fixture printer',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state:'active',paperWidthMm:80},revision:1,deletedAt:null,createdAt:{seconds:1},updatedAt:{seconds:1}});
 f.rows.set(path+'/deviceCredentials/current',{schemaVersion:1,brandId:'brand',locationId:'location',printerId:'p1',printerRevision:1,credentialRevision:1,secretDigest:'a'.repeat(64),issuedAt:1,revokedAt:null});return path;}
const printCommand=()=>({orderId:'ORD-1',brandId:'brand',locationId:'location',printerId:'p1',printerRevision:1,kind:'kitchen',requestId:randomUUID()});
async function printFlags(run){const keys=['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED','ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED'],saved=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='true');try{return await run();}finally{keys.forEach((k,i)=>saved[i]===undefined?delete process.env[k]:process.env[k]=saved[i]);}}
function stubRasterOnly(f,onRender){const payload=Buffer.from('89504e470d0a1a0a'+'00'.repeat(16),'hex');f.mocks['./receipt-print-content']={prepareReceiptPrintContent:async()=>{onRender?.();return {payload,sha256:createHash('sha256').update(payload).digest('hex')};}};}
test('terminal reprint uses scoped authority and immutable existing pointer/idempotency rules',()=>fixture(async({f})=>printFlags(async()=>{
 const path=seedPrinter(f);stubRasterOnly(f);const api=f.load('src/lib/printing/manual-print-request.ts'),c=printCommand();
 const a=await api.requestTerminalPrint(c);assert.equal(a.state,'queued');assert.deepEqual(await api.requestTerminalPrint(c),a);
 assert.equal(f.rows.get(path+'/manualPrintRequests/'+c.requestId).actorId.length,64);
 await assert.rejects(api.requestMerchantPrint({...c,requestId:randomUUID()}),e=>e.status===401);
 await assert.rejects(api.requestTerminalPrint({...c,orderId:'ORD-FOREIGN',locationId:'other',requestId:randomUUID()}),e=>e.status===401);
 Object.assign(f.rows.get(path+'/manualPrintRequests/'+c.requestId),{state:'unknown',offeredAt:f.now,downloadedAt:f.now,completedAt:f.now,tokenDigest:'b'.repeat(64)});
 await assert.rejects(api.requestTerminalPrint({...c,requestId:randomUUID()}),e=>e.code==='manual_print_conflict');
 assert.equal((await api.readTerminalPrint(c)).state,'unknown');
})));
test('terminal reprint rendering race with credential reset commits neither job nor audit',()=>fixture(async({f})=>printFlags(async()=>{
 const path=seedPrinter(f);stubRasterOnly(f,()=>{f.rows.get('terminalCredentials/location').revision++;});
 await assert.rejects(f.load('src/lib/printing/manual-print-request.ts').requestTerminalPrint(printCommand()),e=>e.status===401);
 assert.equal([...f.rows.keys()].some(key=>key.startsWith(path+'/manualPrint')),false);
})));
test('terminal cash collection invokes actual invoice/accounting once and preserves narrow scope',()=>fixture(async({f})=>{
 f.rows.set('orders/ORD-1',order({paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
 const settlement=f.load('src/lib/server/settle-checkout.ts');
 assert.equal(await settlement.settleTerminalPickupOrder('ORD-1','cash'),true);assert.equal(await settlement.settleTerminalPickupOrder('ORD-1','cash'),false);
 const paid=f.rows.get('orders/ORD-1');assert.equal(paid.paymentStatus,'Paid');assert.equal(paid.invoice.paymentMethod,'Cash');assert.equal(paid.paymentCollection.employeeName,'Terminal · Fixture location');assert.equal(f.rows.get('customers/customer').totalOrders,1);
 assert.equal([...f.rows.values()].filter(v=>v.action==='pickup_payment_received').length,1);
 await assert.rejects(settlement.settleTerminalPickupOrder('ORD-FOREIGN','cash'),e=>e.status===401);
 await assert.rejects(settlement.settlePaidPickupOrder('ORD-1','cash'),e=>e.status===401);
}));
test('payment mutation retry revokes terminal before invoice, counter or paid write can commit',()=>fixture(async({f})=>{
 f.rows.set('orders/ORD-1',order({paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
 const before=new Map(f.rows);f.options.retry=rows=>{rows.get('terminalCredentials/location').revision++;};
 await assert.rejects(f.load('src/lib/server/settle-checkout.ts').settleTerminalPickupOrder('ORD-1','card'),e=>e.status===401);
 assert.equal(f.rows.get('orders/ORD-1').paymentStatus,'Pending');assert.equal(f.rows.get('orders/ORD-1').invoice,undefined);
 assert.equal([...f.rows.keys()].filter(k=>!before.has(k)).length,0);assert.equal(f.rows.get('customers/customer').totalOrders,0);
}));
test('terminal pickup print proof is opaque, scope-bound and rechecks credential revocation',()=>fixture(async({f})=>{
 f.rows.set('orders/ORD-1',order({paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
 const proofApi=f.load('src/lib/printing/pickup-transition-proof.ts');
 const proof=await proofApi.verifyTerminalPickupPrintPayment({orderId:'ORD-1',method:'cash'});
 await f.db.runTransaction(async transaction=>{
   const context={db:f.db,transaction};const transition=await proofApi.preparePickupPrintTransition(context,proof);
   assert.equal(proofApi.pickupPrintTransitionProjection(context,transition).previousPaymentStatus,'Pending');
   assert.equal(f.rows.get('orders/ORD-1').paymentStatus,'Pending','proof is not actual payment');
 });
 await assert.rejects(f.db.runTransaction(transaction=>proofApi.preparePickupPrintTransition({db:f.db,transaction},{...proof})),e=>e.code==='pickup_unverified');
 await assert.rejects(proofApi.verifyPickupPrintPayment({orderId:'ORD-1',method:'cash'}),e=>e.code==='pickup_unverified');
 f.rows.get('terminalCredentials/location').enabled=false;
 await assert.rejects(f.db.runTransaction(transaction=>proofApi.preparePickupPrintTransition({db:f.db,transaction},proof)),e=>e.code==='pickup_unverified');
 assert.equal(f.rows.get('orders/ORD-1').paymentStatus,'Pending');
}));
test('enabled print-intent settlement still reauthenticates terminal and never backfills when print policy is off',()=>fixture(async({f})=>{
 const key='ORDERFLY_PRINT_INTENTS_ENABLED',previous=process.env[key];process.env[key]='true';
 try{
   f.rows.set('orders/ORD-1',order({paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
   const settlement=f.load('src/lib/server/settle-checkout.ts');assert.equal(await settlement.settleTerminalPickupOrder('ORD-1','card'),true);
   assert.equal(f.rows.get('orders/ORD-1').paymentStatus,'Paid');assert.equal(f.rows.get('orders/ORD-1').paymentCollection.method,'card');
   assert.equal([...f.rows.keys()].some(k=>k.includes('/printIntents/')||k.includes('/printJobs/')),false);
 }finally{previous===undefined?delete process.env[key]:process.env[key]=previous;}
}));
test('enabled routed original policy rejects missing native catalog without financial or print writes',()=>fixture(async({f})=>{
 const key='ORDERFLY_PRINT_INTENTS_ENABLED',previous=process.env[key];process.env[key]='true';
 try{
   f.rows.set('orders/ORD-1',order({paymentStatus:'Pending',paymentMethod:'PayAtPickup',discountReservation:'held'}));
   seedPrinter(f);
   f.rows.set('locations/location/printIntentPolicies/original',{schemaVersion:1,id:'original',brandId:'brand',locationId:'location',revision:1,enabled:true,deletedAt:null,targets:[{printerId:'p1',printerRevision:1,kinds:['kitchen']}]});
   f.rows.set('locations/location/printerRouting/original',{schemaVersion:1,id:'original',brandId:'brand',locationId:'location',revision:1,deletedAt:null,rules:[{id:'rule',brandId:'brand',locationId:'location',printerId:'p1',match:{type:'category',id:'pizza'},effect:'include'}]});
   const before=structuredClone([...f.rows]);
   await assert.rejects(f.load('src/lib/server/settle-checkout.ts').settleTerminalPickupOrder('ORD-1','cash'),e=>e.code==='invalid_catalog');
   assert.deepEqual([...f.rows],before,'missing native catalog must roll back every payment/print mutation');
 }finally{previous===undefined?delete process.env[key]:process.env[key]=previous;}
}));
