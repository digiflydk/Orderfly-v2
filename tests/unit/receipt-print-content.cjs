const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { createHash } = require('node:crypto');
const scope = { orderId: 'o1', brandId: 'b1', locationId: 'l1', printerId: 'p1' };
function fixture() {
  const order = { brandId: 'b1', locationId: 'l1', brandName: 'Saved restaurant', locationName: 'Saved location',
    customerName: 'Saved customer', customerContact: 'saved@example.test', customerDetails: { phone: '12345678', deliveryInstructions: 'Pak separat' },
    status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup', deliveryTime: 'Hurtigst muligt',
    createdAt: '2026-10-25T08:00:00Z', productItems: [{ id: 'pasta', name: 'Saved pasta', quantity: 2, itemType: 'product', toppings: ['Uden løg'], unitPrice: 75, totalPrice: 150 }],
    paymentDetails: { subtotal: 150, discountTotal: 0, deliveryFee: 0 }, totalAmount: 150 };
  const rows = new Map([
    ['orders/o1', order], ['brands/b1', { name: 'Current brand', companyName: 'Seller ApS', companyRegNo: '12345678', street: 'Road 1', city: 'Copenhagen' }],
    ['locations/l1', { brandId: 'b1', name: 'Current location' }],
    ['locations/l1/printers/p1', { schemaVersion: 1, revision: 1, deletedAt: null, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Kitchen', manufacturer: 'star', model: 'mc-print3', paperWidthMm: 80, transport: 'cloudprnt-http', state: 'active' } }],
    ['products/pasta', { brandId: 'b1', isActive: true, categoryId: 'food', productName: 'Changed pasta', locationIds: ['l1'] }],
    ['categories/food', { brandId: 'b1', isActive: true, locationIds: ['l1'], categoryName: 'Pasta' }],
  ]);
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => col(`${path}/${name}`) });
  const col = path => ({ doc: name => ref(`${path}/${name}`) });
  const reads = [], tx = { get: async r => { reads.push(r.path); return { id: r.id, exists: rows.has(r.path), data: () => rows.get(r.path) }; } };
  let inside = false, logoReads = 0, renderReads = 0;
  const db = { collection: col, runTransaction: async fn => { inside = true; try { return await fn(tx); } finally { inside = false; } } };
  const load = moduleGraph({ 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/lib/receipts/print-raster': {
      rasterizeReceipt: async doc => { assert.equal(inside, false, 'render outside transaction'); renderReads++; const payload = Buffer.from(doc.svg); return { payload, sha256: createHash('sha256').update(payload).digest('hex') }; },
      resolveReceiptLogo: async url => { assert.equal(inside, false, 'logo fetch outside transaction'); logoReads++; return 'data:image/png;base64,aGVsbG8='; },
    } });
  return { api: load('src/lib/printing/receipt-print-content.ts'), db, tx, rows, reads, order, metrics: () => ({ logoReads, renderReads }) };
}
test('native kitchen snapshot shares saved content/settings/categories and actual paper width', async () => {
  const f = fixture(); const settings = { paperWidthMm: 58, heading: 'Produktion', showBrandName: true, showLocationName: true, showCustomer: false, showPhone: true, groupByCategory: true, textSize: 'normal' };
  f.rows.set('kitchenReceiptSettings/b1', { schemaVersion: 1, brandId: 'b1', revision: 2, settings });
  const result = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, scope);
  assert.equal(result.settings.heading, 'Produktion'); assert.equal(result.settings.paperWidthMm, 80);
  assert.equal(result.order.lines[0].name, 'Saved pasta'); assert.equal(result.order.lines[0].category, 'Pasta');
  assert.deepEqual(result.order.lines[0].modifiers, ['Uden løg']); assert.equal(result.order.customerPhone, '12345678');
  assert.equal(result.order.brandName, 'Saved restaurant'); assert.equal(result.order.notes, 'Pak separat');
});
test('automatic selected canonical lines cannot duplicate or exceed saved order', async () => {
  const f = fixture(); f.order.productItems.push({ id: 'soda', name: 'Soda', itemType: 'product', quantity: 1 });
  const snapshot = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, { ...scope, lineIds: ['line-1'] });
  assert.deepEqual(snapshot.order.lines.map(x => x.name), ['Soda']);
  for (const lineIds of [[], ['line-0', 'line-0'], ['line-9'], ['line-01'], ['wrong']]) {
    await assert.rejects(f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, { ...scope, lineIds }), /receipt_content_unavailable/);
  }
});
test('scope swaps, inactive printers, malformed settings and oversized selections fail closed', async () => {
  const mutations = [
    f => f.order.brandId = 'other', f => f.rows.get('locations/l1').brandId = 'other',
    f => f.rows.get('locations/l1/printers/p1').configuration.locationId = 'other',
    f => f.rows.get('locations/l1/printers/p1').configuration.state = 'disabled',
    f => f.rows.set('kitchenReceiptSettings/b1', { schemaVersion: 1, brandId: 'other', revision: 1, settings: {} }),
    f => f.order.productItems = Array(101).fill(f.order.productItems[0]),
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(f.api.prepareReceiptPrintContent({ ...scope, kind: 'kitchen' }), /receipt_content_unavailable/); assert.equal(f.metrics().renderReads, 0); }
});
test('manual kitchen includes saved menu children and supports historical cancelled warning', async () => {
  const f = fixture(); f.order.status = 'Canceled';
  f.order.productItems = [{ id: 'menu', itemType: 'combo', name: 'Menu', quantity: 2, comboSelections: [{ groupName: 'Pizzaer', products: [{ id: 'pasta', name: 'Saved child' }, { id: 'pasta', name: 'Saved child' }] }] }];
  const result = await f.api.prepareReceiptPrintContent({ ...scope, kind: 'kitchen' });
  assert.match(result.payload.toString(), /ANNULLERET/); assert.match(result.payload.toString(), /4 × Saved child/); assert.match(result.payload.toString(), /Menuindhold i alt/);
});
test('customer content preserves immutable invoice fiscal facts and resolves logo after native reads', async () => {
  const f = fixture(); f.rows.get('brands/b1').logoUrl = 'https://firebasestorage.googleapis.com/logo.png';
  f.order.invoice = { number: 'INV-1', currency: 'DKK', seller: { legalName: 'Historical seller', tradingName: 'Historical brand', registrationNumber: '11111111', address: 'Old road' },
    fulfillmentLocation: { name: 'Historical location' }, customer: { name: 'Invoice customer', email: 'invoice@example.test' },
    lines: [{ description: 'Fiscal saved line', quantity: 1, unitAmount: 123, totalAmount: 123 }], subtotal: 123, itemDiscount: 0, orderDiscount: 0,
    deliveryFee: 0, bagFee: 0, adminFee: 0, vatAmount: 24.6, totalAmount: 123, paymentMethod: 'Stripe' };
  const result = await f.api.prepareReceiptPrintContent({ ...scope, kind: 'customer' });
  const svg = result.payload.toString(); assert.match(svg, /Historical seller/); assert.match(svg, /Fiscal saved line/); assert.doesNotMatch(svg, /Saved pasta/);
  assert.match(svg, /123,00/); assert.match(svg, /11111111/); assert.equal(f.metrics().logoReads, 1); assert.equal(f.metrics().renderReads, 1);
});
test('customer cannot invent missing monetary facts and catalog enrichment never leaks other scope', async () => {
  const f = fixture(); delete f.order.paymentDetails;
  await assert.rejects(f.api.prepareReceiptPrintContent({ ...scope, kind: 'customer' }), /receipt_content_unavailable/);
  const g = fixture(); g.rows.get('categories/food').locationIds = ['other-location'];
  const result = await g.api.prepareKitchenPrintSnapshot({ db: g.db, transaction: g.tx }, scope);
  assert.equal(result.order.lines[0].category, 'Varer');
});

test('physical headings accept native category ownership without legacy brandId, same as preview', async () => {
  const f = fixture(); delete f.rows.get('categories/food').brandId;
  const snapshot = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, scope);
  assert.equal(snapshot.order.lines[0].category, 'Pasta');
});

function managedFixture(options = {}) {
  const f = fixture(), { loadTs } = require('../helpers/load-ts.cjs');
  const now = Date.now(), ready = new Date(now + 600000).toISOString();
  const nativeScope = { brandId: 'b1', locationId: 'l1' }, scope = { ...nativeScope, orderId: 'o1' };
  const price = { rules: { version:'1', currency:'DKK', taxBasis:'inclusive', maxDistanceMeters:10000, minimumMinor:0, maximumCustomerFeeMinor:5000, maximumSubsidyMinor:5000, tariff:{kind:'kilometer',baseMinor:1000,includedMeters:0,perKmMinor:100} }, route:{meters:1000,method:'route',source:'fixture',profile:'car',calculatedAt:new Date(now).toISOString()}, itemSubtotalAfterDiscountMinor:10000,providerCost:{amountMinor:2000,currency:'DKK',taxBasis:'inclusive'} };
  const addr = { country:'DK',postcode:'2300',city:'Copenhagen',street:'Saved Street',building:'10',unit:null,coordinates:{latitude:55.6,longitude:12.6,source:'fixture'} };
  const fulfillment = { version:1,scope:nativeScope,checkoutRef:'C',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Restaurant',phone:'+4512345678'},dropoffContact:{name:'Customer',phone:'+4587654321'},instructions:'Ring twice',readyAt:ready,desiredDelivery:options.scheduled ? {kind:'scheduled',interval:{earliest:'2026-10-26T16:00:00Z',latest:'2026-10-26T16:00:00Z'}} : {kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[] };
  const caps = {quote:true,create:true,readByProviderId:false,lookupByInternalReference:false,enforcedCreateIdempotency:false,cancellation:true,cancellationPricePreview:false,scheduledDeliveries:true,readyForPickup:false,trackingLinks:true,authenticatedWebhooks:true,sequenceNumbers:false};
  const providerQuote={kind:'available',providerId:'wolt',quoteRef:'native',cost:{...price.providerCost,taxMinor:null},surcharges:[],expiresAt:null,pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,distance:null,capabilities:caps};
  const {quote}=loadTs('src/lib/delivery/quotes/binding.ts').buildQuote({binding:{...nativeScope,checkoutReference:'C',providerId:'wolt',normalizedAddress:'DK Saved Street',cartDigest:'a'.repeat(64),fulfillmentAt:ready,brandRevision:1,locationRevision:0},quoteRef:'Q',providerQuoteRef:'native',nowMs:now,freshnessMs:300000,providerExpiresAtMs:null,price,fulfillment,providerQuote});
  Object.assign(f.order,{deliveryType:'Delivery',fulfillmentAt:ready,managedDelivery:{version:1,providerId:'wolt',quoteRef:'Q',requestDigest:quote.contentDigest}});
  Object.assign(f.order.customerDetails,{address:'Saved Street 10, 2300 København',deliveryInstructions:'Ring twice <please>'});
  f.rows.set('deliveryQuotes/Q',quote);
  f.rows.set('orders/o1/deliveryAttempts/original',{schemaVersion:1,scope,provider:'wolt',intentId:'original',reference:'original',requestDigest:quote.contentDigest,revision:2,state:'booked',providerDeliveryId:'provider-order',createdAt:1,updatedAt:2});
  f.rows.set('orders/o1/deliveryEstimates/current',{...scope,provider:'wolt',providerDeliveryId:'provider-order',pickupReliable:options.reliable === true,pickup:{earliest:'2026-10-26T15:20:00Z',latest:'2026-10-26T15:25:00Z'}});
  return f;
}
test('managed kitchen and customer output retains saved address/instructions and labels desired delivery separately',async()=>{
 for(const kind of ['kitchen','customer']){
  const f=managedFixture();const result=await f.api.prepareReceiptPrintContent({...scope,kind}),svg=result.payload.toString();
  assert.match(svg,/Leveringsadresse/);assert.match(svg,/Saved Street 10/);assert.match(svg,/Ring twice &lt;please&gt;/);
  assert.match(svg,/Ønsket levering/);assert.match(svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' '),/Hurtigst muligt/);assert.match(svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' '),/Tidspunkt ikke/);
  assert.doesNotMatch(svg,/Forventet afhentning/);assert.doesNotMatch(svg,/provider-order/);
 }
});
test('only exact scoped reliable native pickup estimate reaches print facts',async()=>{
 const f=managedFixture({scheduled:true,reliable:true});
 const snapshot=await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope);
 assert.equal(snapshot.order.delivery.requested.kind,'scheduled');
 assert.equal(snapshot.order.delivery.reliablePickup.earliest,'2026-10-26T15:20:00Z');
 for(const width of [58,80]){
  f.rows.get('locations/l1/printers/p1').configuration.paperWidthMm=width;
  const rendered=await f.api.prepareReceiptPrintContent({...scope,kind:'kitchen'});
  const text=rendered.payload.toString().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  assert.match(text,/Forventet afhentning af bud/);assert.match(text,/16[.:]20/);assert.match(text,/17[.:]00/);
 }
 for(const change of [row=>row.brandId='other',row=>row.providerDeliveryId='other',row=>row.pickupReliable=false]){
  const g=managedFixture({reliable:true});change(g.rows.get('orders/o1/deliveryEstimates/current'));
  const saved=await g.api.prepareKitchenPrintSnapshot({db:g.db,transaction:g.tx},scope);
  assert.equal(saved.order.delivery.reliablePickup,null);
 }
});
test('foreign immutable quote fails closed; absent historical quote never invents requested time',async()=>{
 const f=managedFixture();f.rows.get('deliveryQuotes/Q').binding.brandId='foreign';
 await assert.rejects(f.api.prepareReceiptPrintContent({...scope,kind:'kitchen'}),/receipt_content_unavailable/);
 const g=managedFixture();g.rows.delete('deliveryQuotes/Q');
 const snapshot=await g.api.prepareKitchenPrintSnapshot({db:g.db,transaction:g.tx},scope);
 assert.equal(snapshot.order.delivery.requested,null);assert.equal(snapshot.order.delivery.address,'Saved Street 10, 2300 København');
 const pickup=fixture();pickup.order.customerDetails.address='Do not print pickup address';
 const native=await pickup.api.prepareKitchenPrintSnapshot({db:pickup.db,transaction:pickup.tx},scope);
 assert.equal(native.order.delivery,undefined);
});

test('managed output keeps delivery instructions even when optional customer notes are disabled',async()=>{
 const f=managedFixture();const {loadTs}=require('../helpers/load-ts.cjs');
 const settings=loadTs('src/lib/receipts/settings.ts').DEFAULT_RECEIPT_SETTINGS;
 f.rows.set('receiptSettings/b1',{schemaVersion:1,brandId:'b1',revision:1,settings:{...settings,showNotes:false}});
 const result=await f.api.prepareReceiptPrintContent({...scope,kind:'customer'});
 assert.match(result.payload.toString(),/Ring twice &lt;please&gt;/);
});

test('original kitchen print includes scoped booking pickup ETA before courier update, on both widths',async()=>{
 for(const width of [58,80]){
  const f=managedFixture();f.rows.delete('orders/o1/deliveryEstimates/current');
  const attempt=f.rows.get('orders/o1/deliveryAttempts/original');
  const record={scope:attempt.scope,providerId:'wolt',requestDigest:attempt.requestDigest,attemptRef:attempt.reference,result:{kind:'accepted',providerDeliveryId:attempt.providerDeliveryId,nativeReference:'native',trackingUrl:null,pickupEstimateProvenance:{source:'wolt.create',reliability:'preliminary',observedAt:'2026-10-30T09:00:00Z'},pickupInterval:{earliest:'2026-10-30T10:45:00Z',latest:'2026-10-30T10:50:00Z'},deliveryInterval:null,cost:null}};
  f.rows.set('orders/o1/deliveryDispatchResults/original',record);f.rows.get('locations/l1/printers/p1').configuration.paperWidthMm=width;
  const snapshot=await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope);
  assert.equal(snapshot.order.delivery.reliablePickup,null);assert.equal(snapshot.order.delivery.plannedPickup.earliest,'2026-10-30T10:45:00Z');
  const result=await f.api.prepareReceiptPrintContent({...scope,kind:'kitchen'});const text=result.payload.toString().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  assert.match(text,/Klar til afhentning/);assert.match(text,/planlagt/);assert.match(text,/11[.:]45/);assert.doesNotMatch(text,/Forventet afhentning af bud/);
  for(const [field,value] of [['requestDigest','b'.repeat(64)],['attemptRef','other'],['providerId','other']]){
   const prior=record[field];record[field]=value;
   const rejected=await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope);assert.equal(rejected.order.delivery.plannedPickup,null);record[field]=prior;
  }
  for(const status of ['cancelled','failed']){
   f.rows.set('orders/o1/deliveryState/current',{...attempt.scope,provider:'wolt',providerDeliveryId:attempt.providerDeliveryId,status});
   const stopped=await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope);assert.equal(stopped.order.delivery.plannedPickup,null);assert.equal(stopped.order.delivery.reliablePickup,null);assert.equal(stopped.order.delivery.pickupUnavailable,status);
   const rendered=await f.api.prepareReceiptPrintContent({...scope,kind:'kitchen'});assert.doesNotMatch(rendered.payload.toString(),/Klar til afhentning/);
  }
  f.rows.delete('orders/o1/deliveryState/current');
  f.rows.set('orders/o1/deliveryCancellation/original',{version:1,...attempt.scope,attemptRef:attempt.reference,providerDeliveryId:attempt.providerDeliveryId,environment:'sandbox',state:'cancelled',reconcileRequired:false,result:{kind:'cancelled',fee:null}});
  const cancelled=await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope);assert.equal(cancelled.order.delivery.plannedPickup,null);
  f.rows.delete('orders/o1/deliveryCancellation/original');
  record.scope={...record.scope,brandId:'foreign'};assert.equal((await f.api.prepareKitchenPrintSnapshot({db:f.db,transaction:f.tx},scope)).order.delivery.plannedPickup,null);
 }
});
