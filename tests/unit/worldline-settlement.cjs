const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');

const flag = process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true';
process.on('exit', () => { if (flag === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = flag; });
const printerPath = id => 'locations/l/printers/' + id;
const policyPath = 'locations/l/printIntentPolicies/original';
const rulesPath = 'locations/l/printerRouting/original';
async function fixture(options = {}) {
  const f = await paymentFixture();
  f.records.get('brands/b').status = 'active';
  Object.assign(f.order(), { paymentMethod: 'Worldline', status: 'Pending', psp: { provider:'worldline',transactionId:'123' },paymentAgreement:{provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',revision:1,reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`} });
  f.records.set('categories/pizza', { isActive: true, locationIds: ['l'] });
  const printer = id => ({ schemaVersion: 1, configuration: { id, brandId: 'b', locationId: 'l', name: id,
    manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', paperWidthMm: 80, state: 'paused' }, revision: 1, deletedAt: null });
  for (const id of ['pizza', 'packing']) f.records.set(printerPath(id), printer(id));
  f.records.set(policyPath, { schemaVersion: 1, id: 'original', brandId: 'b', locationId: 'l', revision: 1, enabled: true, deletedAt: null,
    targets: ['pizza', 'packing'].map(printerId => ({ printerId, printerRevision: 1, kinds: ['kitchen'] })) });
  f.records.set(rulesPath, { schemaVersion: 1, id: 'original', brandId: 'b', locationId: 'l', revision: 1, deletedAt: null,
    rules: ['pizza', 'packing'].map(printerId => ({ id: 'rule-' + printerId, brandId: 'b', locationId: 'l', printerId, match: { type: 'category', id: 'pizza' }, effect: 'include' })) });
  const collection = f.db.collection;
  const wrapRef = ref => ({ ...ref, collection: child => query(collection(ref.path + '/' + child)) });
  const query = native => ({ ...native, doc: id => wrapRef(native.doc(id)),
    where: (...args) => query(native.where(...args)), limit: count => query(native.limit(count)),
    get: async () => { const result = await native.get(); return { ...result, size: result.docs.length }; },
  });
  f.db.collection = name => query(collection(name));
  const transact = f.db.runTransaction, attempts = [], requests = [];
  const stableTx = {};
  let retry = !!options.retry;
  const conflict = new Error('fixture retry');
  f.db.runTransaction = async (run, transactionOptions) => {
    const attempt = () => transact(async tx => {
      const events = []; attempts.push({ readOnly: !!transactionOptions?.readOnly, events }); let wrote = false;
      const write = name => (ref, data, ...rest) => {
        assert.equal(transactionOptions?.readOnly || false, false);
        wrote = true; events.push({ method: name, path: ref.path });
        options.afterWrite?.(ref.path, f);
        if (options.failPath && ref.path.startsWith(options.failPath)) throw new Error('fixture late write failure');
        return tx[name](ref, data, ...rest);
      };
      Object.assign(stableTx, { get: ref => {
        assert.equal(wrote, false, 'all financial and print reads precede every write');
        events.push({ method: 'get', path: ref.path }); return tx.get(ref);
      }, set: write('set'), update: write('update'), create: write('create') });
      const result = await run(stableTx);
      if (transactionOptions?.readOnly && options.afterPreflight) options.afterPreflight(f);
      if (!transactionOptions?.readOnly && retry) { retry = false; throw conflict; }
      return result;
    });
    try { return await attempt(); } catch (error) {
      if (error !== conflict) throw error;
      options.onRetry?.(f); return attempt();
    }
  };
  const session = { id: 'cs_test_atomic_349_reference', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'dkk',
    amount_total: Math.round(f.order().totalAmount * 100), metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  class Provider { checkout = { sessions: { retrieve: async id => { requests.push(id); if (options.providerFailure) throw Error('private provider detail'); return { ...structuredClone(session), ...options.providerPatch }; } } }; }
  const storeMock={readPinnedWorldlineAgreement:async binding=>({binding,credentials:{merchantNumber:'T123'}})};
  const clientMock={readWorldlineTransaction:async()=>{requests.push('123');if(options.providerFailure)throw Error('provider unavailable');options.afterProvider?.(f);return {id:'123',orderid:f.orderId,merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:session.amount_total,captured:session.amount_total,credited:0},...options.providerPatch};}};
  const load = moduleGraph({'./worldline-store':storeMock,'./worldline-client':clientMock, ...f.mocks, 'next/headers': { cookies: async () => ({ get: () => undefined }) }, stripe: { default: Provider },
    '@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async binding=>({binding,credentials:{merchantNumber:'T123'}})},
    '@/lib/payments/worldline-client':{readWorldlineTransaction:async()=>{requests.push('123');if(options.providerFailure)throw Error('provider unavailable');options.afterProvider?.(f);return {id:'123',orderid:f.orderId,merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:session.amount_total,captured:session.amount_total,credited:0},...options.providerPatch};}},
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => 'fixture-provider-key' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'fixture-server-time' } },
  });
  const settlement = load('src/lib/server/settle-checkout.ts');
  const outbox = load('src/lib/printing/outbox.ts');
  const origins = load('src/lib/payments/worldline-proof.ts');
  const domain = load('src/lib/printing/domain.ts');
  return { ...f, session, requests, attempts, load, settlement, outbox, origins, domain,
    settle: () => settlement.settleWorldlineOrder(f.orderId,'123'),
    jobs: () => [...f.records].filter(([path]) => path.includes('/jobs/')),
    ledgers: () => [...f.records].filter(([path]) => path.endsWith('/queue/state')),
    context: () => ({ db: f.db, transaction: stableTx }),
  };
}


test('Worldline capture proof commits accounting, notification and original print atomically; replay never duplicates',async()=>{
 const f=await fixture();assert.equal(await f.settle(),true);assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().invoice.paymentMethod,'Worldline');assert.equal(f.jobs().length,2);assert.equal(f.ledgers().length,2);assert.equal(f.records.get('customers/'+f.order().customerDetails.id).totalOrders,1);
 const before=structuredClone([...f.records]);assert.equal(await f.settle(),false);assert.deepEqual([...f.records],before);
});
test('authorization without capture, refund, wrong order, amount, currency and provider outage never settle or print',async()=>{
 for(const providerPatch of [{total:{authorized:10400,captured:0,credited:0}},{total:{authorized:10400,captured:10400,credited:1}},{orderid:'other'},{currency:{code:'EUR',minorunits:2}}]){
  const f=await fixture({providerPatch});await assert.rejects(f.settle());assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);
 }
 const f=await fixture({providerFailure:true});await assert.rejects(f.settle());assert.equal(f.jobs().length,0);
});
test('late print failure rolls back the entire financial settlement and can reconcile safely',async()=>{
 const f=await fixture({failPath:'locations/l/printers/packing/jobs/'});await assert.rejects(f.settle());assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);assert.equal(f.records.get('customers/'+f.order().customerDetails.id).totalOrders,0);
});

test('refund lock or payment revision changed after provider retrieval invalidates settlement proof',async()=>{
 for(const patch of [{paymentOperation:'refund-active'},{paymentRevision:7}]){
 const f=await fixture({afterProvider:f=>Object.assign(f.order(),patch)});await assert.rejects(f.settle(),/Worldline payment changed/);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);assert.ok(f.requests.length>0);
 }
});
