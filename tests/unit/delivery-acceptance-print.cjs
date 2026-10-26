const { test } = require('node:test');
const { createHash } = require('node:crypto');
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
  Object.assign(f.order(), { paymentMethod: 'Stripe', status: 'Pending', psp: { checkoutSessionId: 'cs_test_atomic_349_reference' } });
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
  const scope={brandId:'b',locationId:'l',orderId:f.orderId},requestDigest='a'.repeat(64);
  const reference=createHash('sha256').update(JSON.stringify(['delivery-original-v1','b','l',f.orderId])).digest('hex');
  Object.assign(f.order(),{paymentStatus:'Paid',deliveryType:'Delivery',managedStripeAccount:{accountId:'acct_test',livemode:false},managedDelivery:{version:1,providerId:'wolt',quoteRef:'quote',requestDigest}});
  // The generic fixture starts as pickup; managed checkout has no acceptance notification yet.
  for(const [path] of f.records)if(path.startsWith('orderNotificationJobs/')||path.startsWith('marketingOrderOutbox/'))f.records.delete(path);
  Object.assign(f.order().psp,{provider:'stripe',paymentIntentId:'pi_test'});
  f.records.set('orders/'+f.orderId+'/deliveryAttempts/original',{schemaVersion:1,scope,provider:'wolt',intentId:reference,reference,requestDigest,revision:2,state:'booked',providerDeliveryId:'native',createdAt:1,updatedAt:2});
  f.records.set('orders/'+f.orderId+'/deliveryDispatchResults/original',{version:1,scope,attemptRef:reference,requestDigest,providerId:'wolt',claimId:'claim',result:{kind:'accepted',providerDeliveryId:'native',nativeReference:'native',trackingUrl:null,pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,cost:null},recordedAtMs:2});
  f.records.set('orders/'+f.orderId+'/deliveryDispatch/original',{scope,requestDigest,claimId:'claim',networkStartedAtMs:1});
  f.records.set('deliveryDispatchJobs/'+f.orderId,{...scope,version:1,providerId:'wolt',requestDigest,state:'booked',acceptanceCompletedAtMs:null});
  const session = { livemode:false,payment_intent:'pi_test',id: 'cs_test_atomic_349_reference', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'dkk',
    amount_total: Math.round(f.order().totalAmount * 100), metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  class Provider {
    accounts={retrieve:async()=>({id:'acct_test'})};
    checkout={sessions:{retrieve:async()=>{requests.push('session');return session;}}};
    paymentIntents={retrieve:async()=>({id:'pi_test',status:'succeeded',livemode:false,currency:'dkk',amount:session.amount_total,amount_received:session.amount_total,metadata:scope,
      latest_charge:{id:'ch_test',paid:true,disputed:false,livemode:false,currency:'dkk',amount:session.amount_total,amount_refunded:0,payment_intent:'pi_test'}})};
  }
  const load = moduleGraph({ ...f.mocks, 'next/headers': { cookies: async () => ({ get: () => undefined }) }, stripe: { default: Provider },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => 'sk_test_fake' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'fixture-server-time' } },
  });
  const settlement = load('src/lib/delivery/payments/acceptance.ts');
  const outbox = load('src/lib/printing/outbox.ts');
  const origins = load('src/lib/printing/stripe-transition-proof.ts');
  const domain = load('src/lib/printing/domain.ts');
  return { ...f, session, requests, attempts, load, settlement, outbox, origins, domain,
    settle: () => settlement.completeManagedDeliveryAcceptance(scope),
    jobs: () => [...f.records].filter(([path]) => path.includes('/jobs/')),
    ledgers: () => [...f.records].filter(([path]) => path.endsWith('/queue/state')),
    context: () => ({ db: f.db, transaction: stableTx }),
  };
}

test('delayed native acceptance atomically confirms and prints exactly once without financial replay',async()=>{
 const f=await fixture();const customerBefore=structuredClone(f.records.get('customers/'+f.order().customerDetails.id));
 assert.equal(await f.settle(),true);assert.equal(f.order().status,'Received');assert.equal(f.jobs().length,2);
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,1);
 assert.equal(await f.settle(),false);assert.equal(f.jobs().length,2);assert.deepEqual(f.records.get('customers/'+f.order().customerDetails.id),customerBefore);
 assert.equal(typeof f.records.get('deliveryDispatchJobs/'+f.orderId).acceptanceCompletedAtMs,'number');
});
test('acceptance refuses refunded/unknown/foreign evidence before output',async()=>{
 for(const mutate of [f=>f.records.get('orders/'+f.orderId+'/deliveryDispatch/original').networkStartedAtMs=null,f=>f.order().refundedAmountOre=1,f=>f.records.get('orders/'+f.orderId+'/deliveryDispatchResults/original').result={kind:'unknown',attemptRef:'attempt',error:{code:'timeout',messageKey:'unknown',retry:'after_reconciliation',nativeCode:null}},f=>f.records.get('orders/'+f.orderId+'/deliveryDispatch/original').scope.brandId='other']){
 const f=await fixture();mutate(f);await assert.rejects(f.settle());assert.equal(f.jobs().length,0);assert.equal(f.order().status,'Pending');}
});
test('late print failure rolls back native acceptance and confirmation',async()=>{
 const f=await fixture({failPath:'locations/l/printers/'});await assert.rejects(f.settle());assert.equal(f.order().status,'Pending');assert.equal(f.jobs().length,0);assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,0);
});
test('forged acceptance capability cannot authorize original jobs',async()=>{
 const f=await fixture();assert.throws(()=>f.settlement.readManagedDeliveryAcceptanceCapability(f.context(),{},true),/unverified/);
});
