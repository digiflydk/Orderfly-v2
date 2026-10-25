const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');

const flag = process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true';
process.on('exit', () => { if (flag === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = flag; });
const printerPath = id => 'locations/l/printers/' + id;
const policyPath = 'locations/l/printIntentPolicies/original';
const rulesPath = 'locations/l/printerRouting/original';
async function fixture(options = {}) {
  const f = await paymentFixture();
  f.records.get('brands/b').status = 'active';
  Object.assign(f.order(), { status: 'Received' });
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
  if (options.capacityReservation) {
    const actual = moduleGraph({ 'server-only': {} })('src/lib/server/discount-capacity.ts');
    f.mocks['@/lib/server/discount-capacity'] = { prepareAdminCapacitySettlement: async (...args) => {
      const apply = await actual.prepareAdminCapacitySettlement(...args);
      // Boundary fault injection changes reservation metadata, not the native financial callback.
      return Object.assign(() => apply(), { writeCount: options.capacityReservation });
    } };
  }
  const load = moduleGraph({ ...f.mocks, stripe: { default: Provider },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => 'fixture-provider-key' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'fixture-server-time' } },
  });
  const settlement = load('src/lib/server/settle-checkout.ts');
  const outbox = load('src/lib/printing/outbox.ts');
  const origins = load('src/lib/printing/pickup-transition-proof.ts');
  const domain = load('src/lib/printing/domain.ts');
  return { ...f, session, requests, attempts, load, settlement, outbox, origins, domain,
    settle: (method = 'cash') => settlement.settlePaidPickupOrder(f.orderId, method),
    jobs: () => [...f.records].filter(([path]) => path.includes('/jobs/')),
    ledgers: () => [...f.records].filter(([path]) => path.endsWith('/queue/state')),
    context: () => ({ db: f.db, transaction: stableTx }),
  };
}

// Start from a held Pending order and invoke the actual #491/#506 acceptance
// producer before staff settlement. The test never seeds a canonical manifest.
async function acceptedFixture(options = {}) {
  const f = await fixture(options);
  f.order().status = 'Pending';
  const seed = memoryDb(f.records);
  await seed.runTransaction(async transaction => {
    let wrote = false;
    const write = name => (...args) => { wrote = true; return transaction[name](...args); };
    const context = { db: f.db, transaction: { get: ref => {
      assert.equal(wrote, false, 'acceptance and print reads precede every write');
      return transaction.get(ref);
    }, create: write('create'), update: write('update'), set: write('set') } };
    const acceptance = await f.load('src/lib/server/accept-pickup-checkout.ts').preparePickupCheckoutAcceptance(context,
      { orderId: f.orderId, brandId: 'b', locationId: 'l', selection: 'asap' });
    const originals = await f.load('src/lib/printing/unpaid-acceptance-originals.ts').prepareUnpaidAcceptanceOriginals(context, acceptance.capability);
    acceptance.apply();
    originals.apply();
  });
  assert.equal(f.order().status, 'Received');
  return f;
}

test('#350 actual cash/card collection atomically settles financials while preserving canonical accepted originals once', async () => {
  for (const method of ['cash', 'card']) {
    const f = await acceptedFixture();
    assert.equal(await f.settle(method), true);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().paymentCollection.method, method);
    assert.equal(f.jobs().length, 2); assert.equal(f.ledgers().length, 2); assert.equal(f.requests.length, 0);
    assert.ok(f.jobs().every(([, row]) => row.revision === 0 && row.state === 'queued'));
    assert.ok(f.ledgers().every(([, row]) => row.pendingCount === 1 && row.revision === 1));
    const before = structuredClone([...f.records]); assert.equal(await f.settle(method), false);
    assert.deepEqual([...f.records], before);
  }
});
const writes = f => f.attempts.flatMap(attempt => attempt.events.filter(event => event.method !== 'get'));

test('#350 default OFF and native policy OFF preserve financial collection without print writes', async () => {
  try {
    for (const flag of [undefined, 'false']) {
      if (flag === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = flag;
      const f = await fixture(); assert.equal(await f.settle(), true); assert.equal(f.order().paymentStatus, 'Paid');
      assert.equal(f.jobs().length, 0); assert.equal(f.requests.length, 0);
      assert.equal(f.attempts.some(attempt => attempt.events.some(event => /printIntentPolicies|printerRouting|\/printers\//.test(event.path || ''))), false);
    }
    process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true';
    const f = await fixture(); Object.assign(f.records.get(policyPath), { enabled: false, targets: [] });
    assert.equal(await f.settle(), true); assert.equal(f.jobs().length, 0);
    assert.equal(writes(f).some(event => /printIntents|\/printers\//.test(event.path)), false);
  } finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
});

test('#350 existing accepted-unpaid originals and immutable manifest survive financial settlement unchanged', async () => {
  const f = await acceptedFixture(), unpaid = structuredClone([...f.records]);
  await f.settle();
  const originals = structuredClone([...f.records].filter(([path]) => /\/printers\/.*\/(jobs|queue)\/|\/printIntents\//.test(path)));
  f.records.clear(); for (const [path, row] of unpaid) f.records.set(path, row);
  for (const [path, row] of originals) f.records.set(path, row);
  const beforeWrites = writes(f).length;
  assert.equal(await f.settle(), true); assert.equal(f.order().paymentStatus, 'Paid');
  assert.deepEqual([...f.records].filter(([path]) => /\/printers\/.*\/(jobs|queue)\/|\/printIntents\//.test(path)), originals);
  assert.equal(writes(f).slice(beforeWrites).some(event => /\/printers\/|\/printIntents\//.test(event.path)), false);
});

test('#350 native refunds, scope, reservations, method and routing reject before writes', async () => {
  for (const mutate of [
    f => { f.order().refundedAmountOre = 1; },
    f => { f.order().paymentMethod = 'Stripe'; },
    f => { f.order().discountReservation = 'consumed'; },
    f => { f.order().psp = { checkoutSessionId: 'foreign' }; },
    f => { f.records.get('locations/l').brandId = 'foreign'; },
    f => { f.records.get('products/p').brandId = 'foreign'; },
    f => { f.records.delete(rulesPath); },
    f => { f.records.get(policyPath).targets[0].printerRevision = 99; },
  ]) {
    const f = await acceptedFixture(); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.settle()); assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
  }
});

test('#350 SDK retry rereads canonical originals and financial counters once', async () => {
  const f = await acceptedFixture({ retry: true, onRetry: state => {
    state.records.set('invoiceCounters/b-' + new Date().getUTCFullYear(), { brandId: 'b', lastNumber: 10 });
  } });
  assert.equal(await f.settle(), true); assert.equal(f.jobs().length, 2);
  assert.equal(f.jobs().find(([, row]) => row.printerId === 'pizza')[1].printerRevision, 1);
  assert.match(f.order().invoice.number, /000011$/);
  assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
  assert.ok(f.ledgers().every(([, row]) => row.revision === 1));
});

test('#350 late financial-confirmation failure rolls back collection and preserves accepted originals', async () => {
  const f = await acceptedFixture({ failPath: 'orderNotificationJobs/' }), before = structuredClone([...f.records]);
  await assert.rejects(f.settle(), /fixture late write failure/); assert.deepEqual([...f.records], before);
  assert.ok(writes(f).some(event => event.path === 'orders/' + f.orderId));
  assert.equal(writes(f).some(event => /\/printers\/|\/printIntents\//.test(event.path)), false);
});

test('#350 origin/serialized objects never authorize the closed financial print adapter', async () => {
  const f = await fixture(), origin = await f.origins.verifyPickupPrintPayment({ orderId: f.orderId, method: 'cash' });
  for (const fake of [{}, origin, JSON.parse(JSON.stringify(origin)), null]) {
    await assert.rejects(f.db.runTransaction(transaction => f.outbox.preparePickupSettlementPrintIntents({ db: f.db, transaction }, fake, { intents: [] })), /Unverified settlement print capability/);
  }
  assert.equal(writes(f).length, 0);
});

test('#350 actor change between origin and financial attempt rejects before writes', async () => {
  const f = await acceptedFixture(), original = f.mocks['@/lib/access/orderfly-session'].orderflySession;
  let calls = 0;
  // The graph holds this external I/O module object; identity is never supplied by the callsite.
  f.mocks['@/lib/access/orderfly-session'].orderflySession = async () => {
    const actor = await original(); return ++calls >= 3 ? { ...actor, actorId: 'a'.repeat(64) } : actor;
  };
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /actor changed/);
  assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
});

test('#350 native staff revocation or refund on retry aborts all prior queued mutations', async () => {
  for (const revoke of [
    state => { state.records.get('platformAdminControl/access-v1').memberships[0].active = false; },
    state => { state.records.get('platformAdminControl/access-v1').roles[0].permissions = ['orderfly.orders:view']; },
    state => { state.order().refundedAmountOre = 1; },
    state => { state.order().paymentCollection = { method: 'card' }; },
  ]) {
    const f = await acceptedFixture({ retry: true, onRetry: revoke });
    await assert.rejects(f.settle()); assert.equal(f.order().paymentStatus, 'Pending');
    assert.equal(f.jobs().length, 2); assert.equal(f.ledgers().length, 2);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders || 0, 0);
  }
});

test('#350 malformed original manifest or missing original never backfills on staff collection', async () => {
  for (const mutate of [
    state => { state.records.get('orders/' + state.orderId + '/printIntents/original').policyRevision = 2; },
    state => { const [path] = state.jobs()[0]; state.records.delete(path); },
  ]) {
    const f = await acceptedFixture(), unpaid = structuredClone([...f.records]); await f.settle();
    const originals = structuredClone([...f.records].filter(([path]) => /\/printers\/.*\/(jobs|queue)\/|\/printIntents\//.test(path)));
    f.records.clear(); for (const [path, row] of unpaid) f.records.set(path, row);
    for (const [path, row] of originals) f.records.set(path, row);
    mutate(f); const before = structuredClone([...f.records]); await assert.rejects(f.settle());
    assert.deepEqual([...f.records], before);
  }
});

test('#350 policy ON cannot backfill originals for legacy Paid collection', async () => {
  const f = await fixture();
  try { delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; assert.equal(await f.settle(), true); }
  finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /job_conflict/);
  assert.deepEqual([...f.records], before);
});

test('#350 proof expiry after queued financial writes aborts the shared transaction', async () => {
  const actualNow = Date.now; let now = actualNow(); Date.now = () => now;
  try {
    const f = await acceptedFixture({ afterWrite: path => { if (path.startsWith('orderNotificationJobs/')) now += 300000; } });
    const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /proof_expired/);
    assert.deepEqual([...f.records], before); assert.equal(f.jobs().length, 2);
  } finally { Date.now = actualNow; }
});

test('#350 exact financial budget with canonical original reuse accepts 500 and rejects 501', async () => {
  const baseline = await acceptedFixture(); await baseline.settle();
  const capacityAtLimit = 1 + 500 - writes(baseline).length;
  const allowed = await acceptedFixture({ capacityReservation: capacityAtLimit });
  assert.equal(await allowed.settle(), true); assert.equal(allowed.jobs().length, 2);
  const rejected = await acceptedFixture({ capacityReservation: capacityAtLimit + 1 }), before = structuredClone([...rejected.records]);
  await assert.rejects(rejected.settle(), /^Error: Settlement write budget exceeded$/);
  assert.deepEqual([...rejected.records], before); assert.equal(writes(rejected).length, 0);
});

test('#492 same-target originals cannot be adopted into invented history after losing their manifest', async () => {
  const f = await acceptedFixture();
  f.records.delete('orders/' + f.orderId + '/printIntents/original');
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /job_conflict/);
  assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
});

test('#492 missing canonical history rejects fresh, outside-routing and orphan originals before every write', async () => {
  for (const legacy of ['none', 'outside-routing', 'orphan']) {
    const f = await fixture();
    if (legacy !== 'none') {
      const printerId = 'historical', identity = { orderId: f.orderId, brandId: 'b', locationId: 'l', printerId, kind: 'kitchen', revision: 0 };
      if (legacy === 'outside-routing') f.records.set(printerPath(printerId), {
        schemaVersion: 1, configuration: { ...f.records.get(printerPath('pizza')).configuration, id: printerId }, revision: 1, deletedAt: null,
      });
      const id = f.domain.printJobId(identity);
      f.records.set(printerPath(printerId) + '/jobs/' + id, { schemaVersion: 1, ...identity, id,
        printerRevision: 1, state: 'queued', attempts: 0, createdAt: Date.now() - 1000, updatedAt: 'fixture-server-time' });
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(f.settle(), /job_conflict/);
    assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
  }
});

test('#492 losing canonical history on SDK retry rejects discarded financial changes without backfill', async () => {
  const f = await acceptedFixture({ retry: true, onRetry: state => {
    state.records.delete('orders/' + state.orderId + '/printIntents/original');
  } });
  const originals = structuredClone([...f.records].filter(([path]) => /\/printers\//.test(path)));
  await assert.rejects(f.settle(), /job_conflict/);
  assert.equal(f.order().paymentStatus, 'Pending'); assert.equal(f.order().paymentCollection, undefined);
  assert.equal(f.records.has('orders/' + f.orderId + '/printIntents/original'), false);
  assert.deepEqual([...f.records].filter(([path]) => /\/printers\//.test(path)), originals);
  assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders || 0, 0);
});

test('#492 changed native printer revisions on retry cannot replace canonical accepted originals', async () => {
  const f = await acceptedFixture({ retry: true, onRetry: state => {
    state.records.get(printerPath('pizza')).revision = 2;
    state.records.get(policyPath).targets[0].printerRevision = 2;
  } });
  const originalJobs = structuredClone(f.jobs()), originalLedgers = structuredClone(f.ledgers());
  await assert.rejects(f.settle(), /job_conflict/);
  assert.equal(f.order().paymentStatus, 'Pending'); assert.equal(f.order().paymentCollection, undefined);
  assert.deepEqual(f.jobs(), originalJobs); assert.deepEqual(f.ledgers(), originalLedgers);
  assert.equal(f.records.get('orders/' + f.orderId + '/printIntents/original').targets.find(row => row.printerId === 'pizza').printerRevision, 1);
});

test('permanent mode payment for an accepted order never recreates originals after archival or activation change',async()=>{
 const before=process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED='true';
 try{const f=await acceptedFixture(),now=Date.now();
  f.records.set('brands/b/printSettings/automatic',{schemaVersion:1,brandId:'b',enabled:true,revision:3,enabledAt:now-2000,activationId:'N'.repeat(43),updatedAt:now-2000});
  f.order().createdAt={seconds:Math.floor((now-1000)/1000),nanoseconds:((now-1000)%1000)*1000000};
  for(const printerId of ['pizza','packing']){
   f.records.get(printerPath(printerId)).configuration.state='active';
   f.records.set(printerPath(printerId)+'/deviceCredentials/current',f.load('src/lib/printing/device-auth.ts').createPrinterDeviceCredentialDraft({brandId:'b',locationId:'l',printerId,printerRevision:1,credentialRevision:1}).record);
  }
  for(const [path,job]of f.jobs()){
   f.records.delete(path);f.records.set(path.replace('/jobs/','/expiredPrintJobs/'),{jobId:job.id,reason:'activation_changed'});
  }
  const manifest=structuredClone(f.records.get(`orders/${f.orderId}/printIntents/original`));
  assert.equal(await f.settle(),true);assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.jobs().length,0);
  assert.deepEqual(f.records.get(`orders/${f.orderId}/printIntents/original`),manifest);
 }finally{if(before===undefined)delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=before;}
});
