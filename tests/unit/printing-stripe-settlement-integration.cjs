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
  const session = { id: 'cs_test_atomic_349_reference', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'dkk',
    amount_total: Math.round(f.order().totalAmount * 100), metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  class Provider { checkout = { sessions: { retrieve: async id => { requests.push(id); if (options.providerFailure) throw Error('private provider detail'); return { ...structuredClone(session), ...options.providerPatch }; } } }; }
  const load = moduleGraph({ ...f.mocks, 'next/headers': { cookies: async () => ({ get: () => undefined }) }, stripe: { default: Provider },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => 'fixture-provider-key' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'fixture-server-time' } },
  });
  const settlement = load('src/lib/server/settle-checkout.ts');
  const outbox = load('src/lib/printing/outbox.ts');
  const origins = load('src/lib/printing/stripe-transition-proof.ts');
  const domain = load('src/lib/printing/domain.ts');
  return { ...f, session, requests, attempts, load, settlement, outbox, origins, domain,
    settle: () => settlement.settlePaidCheckoutSession(session),
    jobs: () => [...f.records].filter(([path]) => path.includes('/jobs/')),
    ledgers: () => [...f.records].filter(([path]) => path.endsWith('/queue/state')),
    context: () => ({ db: f.db, transaction: stableTx }),
  };
}

test('#349 actual Stripe settlement commits Paid, routed original jobs and one delta per printer together', async () => {
  const f = await fixture();
  assert.equal(await f.settle(), true);
  assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().status, 'Received');
  assert.equal(f.requests.length, 1); assert.equal(f.jobs().length, 2); assert.equal(f.ledgers().length, 2);
  for (const [, job] of f.jobs()) { assert.equal(job.revision, 0); assert.equal(job.state, 'queued'); assert.equal(job.id, f.domain.printJobId(job)); }
  for (const [, ledger] of f.ledgers()) { assert.equal(ledger.pendingCount, 1); assert.equal(ledger.revision, 1); }
  assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
  assert.equal(f.records.has('orders/' + f.orderId + '/printIntents/original'), true);
  const before = structuredClone([...f.records]);
  assert.equal(await f.settle(), false); assert.deepEqual([...f.records], before);
});

test('#549 supervised print pilot never blocks paid unsupported purchases or prints a partial order', async () => {
  const before = process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
  process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED = 'true';
  try {
    for (const [lineCount, includeCombo, extraToppings] of [[2, true, false], [51, true, false], [97, false, false], [1, false, true]]) {
    const f = await fixture();
    f.records.get(policyPath).supervisedOrderTest = true;
    const crypto = f.load('src/lib/printing/device-auth.ts'), now = Date.now();
    for (const printerId of ['pizza', 'packing']) {
      const scope = { brandId: 'b', locationId: 'l', printerId, printerRevision: 1, credentialRevision: 1 };
      f.records.get(printerPath(printerId)).configuration.state = 'active';
      f.records.set(printerPath(printerId) + '/deviceCredentials/current', crypto.createPrinterDeviceCredentialDraft(scope).record);
      f.records.set(printerPath(printerId) + '/orderTestWindows/current', { schemaVersion: 1, ...scope,
        model: 'mc-print3', paperWidthMm: 80, qualificationId: 'q'.repeat(43), routingRevision: 1,
        issuedAt: now, expiresAt: now + 3600000, stoppedAt: null, actorId: 'firebase:supervisor',
        trust: 'supervised_order_test', physicalPaperCheckedByOperator: true, unattendedAuthorized: false });
    }
    const eligible = await f.db.runTransaction(transaction => f.load('src/lib/printing/intent-target-policy.ts')
      .preparePrintIntentTargetPolicy({ db: f.db, transaction }, { brandId: 'b', locationId: 'l', orderId: f.orderId }));
    assert.equal(eligible.enabled, true, 'the test window actually enables ordinary products before adding a combo');
    // A mixed order must not become a partial product-only kitchen ticket.
    if (includeCombo) f.order().productItems.push({ ...f.order().productItems[0], itemType: 'combo',
      comboSelections: [{ groupName: 'Pizza', products: [{ id: 'choice', name: 'Pizza' }] }] });
    while (f.order().productItems.length < lineCount) f.order().productItems.push({ ...f.order().productItems[0] });
    if (extraToppings) f.order().productItems[0].toppings = Array.from({ length: 9 }, (_, i) => 'Topping ' + i);
    assert.equal(f.order().productItems.length, lineCount);
    assert.equal(await f.settle(), true);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().status, 'Received');
    assert.equal(f.jobs().length, 0); assert.equal(f.ledgers().length, 0);
    assert.equal(f.records.has('orders/' + f.orderId + '/printIntents/original'), false);
    assert.equal(f.requests.length, 0, 'no unnecessary additional print-payment proof request');
    assert.equal(await f.settle(), false);
    assert.equal(f.jobs().length, 0);
    }
  } finally {
    if (before === undefined) delete process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
    else process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED = before;
  }
});

const writes = f => f.attempts.flatMap(attempt => attempt.events.filter(event => event.method !== 'get'));

test('#363 ineligible canonical brands settle received money once without print proof or intent writes', async () => {
  for (const status of ['pending', 'suspended', undefined, 'unknown']) {
    const f = await fixture();
    if (status === undefined) delete f.records.get('brands/b').status; else f.records.get('brands/b').status = status;
    assert.equal(await f.settle(), true); assert.equal(f.order().paymentStatus, 'Paid');
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
    assert.equal(f.requests.length, 0, 'ineligible preflight must not retrieve a print proof');
    assert.equal(f.jobs().length, 0); assert.equal(f.ledgers().length, 0);
    assert.equal(f.records.has('orders/' + f.orderId + '/printIntents/original'), false);
    assert.equal(writes(f).some(event => /printIntents|\/printers\//.test(event.path)), false);
    const before = structuredClone([...f.records]); assert.equal(await f.settle(), false); assert.deepEqual([...f.records], before);
  }
  const trial = await fixture(); trial.records.get('brands/b').status = 'trialing';
  assert.equal(await trial.settle(), true); assert.equal(trial.jobs().length, 2); assert.equal(trial.requests.length, 1);
});

test('#349 canonical active/trialing brands ignore stale legacy isActive through real catalog and routing calls', async () => {
  for (const status of ['active', 'trialing']) {
    const f = await fixture(); Object.assign(f.records.get('brands/b'), { status, isActive: false });
    assert.equal(await f.settle(), true); assert.equal(f.order().paymentStatus, 'Paid');
    assert.equal(f.jobs().length, 2); assert.equal(f.ledgers().length, 2);
    const before = structuredClone([...f.records]); assert.equal(await f.settle(), false);
    assert.deepEqual([...f.records], before);
  }
  for (const options of [
    { afterPreflight: f => { f.records.get('brands/b').isActive = false; } },
    { retry: true, onRetry: f => { f.records.get('brands/b').isActive = false; } },
  ]) {
    const f = await fixture(options); assert.equal(await f.settle(), true);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.jobs().length, 2);
  }
});

test('#349 canonical brand eligibility never relaxes location activity rejection or atomic rollback', async () => {
  for (const isActive of [false, 'true', null]) {
    const f = await fixture(); Object.assign(f.records.get('brands/b'), { status: 'active', isActive: false });
    f.records.get('locations/l').isActive = isActive;
    const before = structuredClone([...f.records]); await assert.rejects(f.settle());
    assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
  }
});

test('#363 suspension between preflight and financial transaction or SDK retry suppresses all print intent', async () => {
  for (const options of [
    { afterPreflight: f => { f.records.get('brands/b').status = 'suspended'; } },
    { retry: true, onRetry: f => { f.records.get('brands/b').status = 'suspended'; } },
  ]) {
    const f = await fixture(options); assert.equal(await f.settle(), true);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.requests.length, 1);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
    assert.equal(f.jobs().length, 0); assert.equal(f.ledgers().length, 0);
    assert.equal(f.records.has('orders/' + f.orderId + '/printIntents/original'), false);
    const before = structuredClone([...f.records]); assert.equal(await f.settle(), false); assert.deepEqual([...f.records], before);
  }
});

test('#363 reactivation after OFF preflight cannot invent payment proof or backfill a Paid order', async () => {
  const f = await fixture({ afterPreflight: state => { state.records.get('brands/b').status = 'active'; } });
  f.records.get('brands/b').status = 'pending';
  await assert.rejects(f.settle(), /verified payment origin required/);
  assert.equal(f.requests.length, 0); assert.equal(writes(f).length, 0); assert.equal(f.order().paymentStatus, 'Pending');
  const late = await fixture(); late.records.get('brands/b').status = 'suspended';
  assert.equal(await late.settle(), true); assert.equal(late.jobs().length, 0);
  late.records.get('brands/b').status = 'active'; const before = structuredClone([...late.records]);
  await assert.rejects(late.settle()); assert.deepEqual([...late.records], before); assert.equal(late.jobs().length, 0);
});

test('#363 suspended Paid replay preserves original immutable manifest jobs and ledgers', async () => {
  const f = await fixture(); assert.equal(await f.settle(), true); assert.equal(f.jobs().length, 2);
  f.records.get('brands/b').status = 'suspended'; const before = structuredClone([...f.records]);
  assert.equal(await f.settle(), false); assert.deepEqual([...f.records], before);
  assert.equal(f.requests.length, 1); assert.equal(f.jobs().length, 2); assert.equal(f.ledgers().length, 2);
});

test('#349 concurrent/repeated payment calls preserve one manifest and original per-printer jobs', async () => {
  const f = await fixture();
  assert.deepEqual(await Promise.all([f.settle(), f.settle(), f.settle()]), [true, false, false]);
  assert.equal(f.jobs().length, 2); assert.ok(f.ledgers().every(([, ledger]) => ledger.revision === 1));
  assert.equal([...f.records.keys()].filter(path => path.endsWith('/printIntents/original')).length, 1);
  assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
});

test('#349 multiple native product rows combine into one original job/ledger delta per printer', async () => {
  const f = await fixture();
  const line = f.order().productItems[0];
  f.order().productItems = [0, 1].map(index => ({ ...line, name: 'Pizza ' + index, quantity: 1,
    totalPrice: Number(line.totalPrice) / 2, unitPrice: Number(line.totalPrice) / 2 }));
  assert.equal(await f.settle(), true); assert.equal(f.jobs().length, 2);
  const manifest = f.records.get('orders/' + f.orderId + '/printIntents/original');
  assert.ok(manifest.targets.every(target => JSON.stringify(target.lineIds) === JSON.stringify(['line-0', 'line-1'])));
  assert.ok(f.ledgers().every(([, ledger]) => ledger.pendingCount === 1 && ledger.revision === 1));
});

test('#349 disabled installation and native OFF policy add no provider request or print writes', async () => {
  try {
    for (const setting of [undefined, 'false', 'TRUE', '1']) {
      if (setting === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = setting;
      const f = await fixture(); assert.equal(await f.settle(), true);
      assert.equal(f.requests.length, 0); assert.equal(f.jobs().length, 0);
      assert.equal(f.attempts.some(attempt => attempt.events.some(event => /printIntentPolicies|printerRouting|\/printers\//.test(event.path || ''))), false);
    }
    process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true';
    const off = await fixture(); Object.assign(off.records.get(policyPath), { enabled: false, targets: [] });
    assert.equal(await off.settle(), true); assert.equal(off.requests.length, 0); assert.equal(off.jobs().length, 0);
    assert.equal(writes(off).some(event => /printIntents|\/printers\//.test(event.path)), false);
  } finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
});

test('#349 policy turning ON after OFF preflight cannot invent payment provenance', async () => {
  let enabled;
  const f = await fixture({ afterPreflight: state => state.records.set(policyPath, enabled) });
  enabled = structuredClone(f.records.get(policyPath));
  Object.assign(f.records.get(policyPath), { enabled: false, targets: [] });
  await assert.rejects(f.settle(), /verified payment origin required/);
  assert.equal(f.requests.length, 0); assert.equal(writes(f).length, 0); assert.equal(f.order().paymentStatus, 'Pending');
});

test('#349 provider proof, native ownership/refunds, policy and saved routing reject atomically', async () => {
  for (const options of [{ providerFailure: true }, { providerPatch: { payment_status: 'unpaid' } },
    { providerPatch: { currency: 'eur' } }, { providerPatch: { amount_total: 1 } },
    { providerPatch: { metadata: { orderId: 'foreign', brandId: 'b', locationId: 'l' } } }]) {
    const f = await fixture(options), before = structuredClone([...f.records]);
    await assert.rejects(f.settle()); assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
  }
  for (const mutate of [
    f => { f.order().refundedAmountOre = 1; },
    f => { f.records.get('products/p').brandId = 'foreign'; },
    f => { f.records.get('categories/pizza').locationIds = ['foreign']; },
    f => { f.records.get(printerPath('pizza')).configuration.state = 'disabled'; },
    f => { f.records.get(policyPath).targets[0].printerRevision = 99; },
    f => { f.records.delete(rulesPath); },
    f => { f.records.get(rulesPath).rules = []; },
    f => { f.records.get(policyPath).targets = f.records.get(policyPath).targets.slice(0, 1); },
    f => { f.order().productItems[0].itemType = 'combo'; },
  ]) {
    const f = await fixture(); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.settle()); assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
  }
});

test('#349 full canonical queue rejects the entire financial and multi-printer fanout', async () => {
  const f = await fixture(), createdAt = Date.now() - 1000;
  for (let index = 0; index < 500; index++) {
    const identity = { brandId: 'b', locationId: 'l', printerId: 'pizza', orderId: 'old' + index, kind: 'kitchen', revision: 0 };
    const id = f.domain.printJobId(identity);
    f.records.set(printerPath('pizza') + '/jobs/' + id, { schemaVersion: 1, ...identity, id, printerRevision: 1, state: 'queued', attempts: 0, createdAt, updatedAt: createdAt });
  }
  f.records.set(printerPath('pizza') + '/queue/state', { schemaVersion: 1, brandId: 'b', locationId: 'l', printerId: 'pizza', revision: 1, pendingCount: 500, oldestPendingAt: createdAt, updatedAt: createdAt });
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /queue_unverified/);
  assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
});

test('#349 last printer-ledger failure rolls back payment, manifest and every printer job', async () => {
  const f = await fixture({ failPath: printerPath('pizza') + '/queue/state' });
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /fixture late write failure/);
  assert.deepEqual([...f.records], before);
  assert.ok(writes(f).some(event => event.path === 'orders/' + f.orderId));
  assert.ok(writes(f).some(event => event.path.endsWith('/printIntents/original')));
  assert.ok(writes(f).some(event => event.path.startsWith(printerPath('packing') + '/jobs/')));
});

test('#349 retry with reused native SDK object revalidates target revisions and commits accounting once', async () => {
  const f = await fixture({ retry: true, onRetry: state => {
    state.records.get(printerPath('pizza')).revision = 2;
    state.records.get(policyPath).targets.find(target => target.printerId === 'pizza').printerRevision = 2;
    state.records.set('invoiceCounters/b-' + new Date().getUTCFullYear(), { brandId: 'b', lastNumber: 10 });
  } });
  assert.equal(await f.settle(), true);
  assert.equal(f.requests.length, 1); assert.equal(f.jobs().length, 2);
  assert.equal(f.jobs().find(([, job]) => job.printerId === 'pizza')[1].printerRevision, 2);
  assert.ok(f.ledgers().every(([, ledger]) => ledger.revision === 1)); assert.match(f.order().invoice.number, /000011$/);
  assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
});

test('#349 Paid replay cannot create a manifest for legacy/default-OFF settlement', async () => {
  const f = await fixture();
  try { delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; assert.equal(await f.settle(), true); }
  finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
  const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /job_conflict/);
  assert.deepEqual([...f.records], before); assert.equal(f.jobs().length, 0);
});

test('#349 Paid replay refuses missing/corrupt manifest, changed targets/rules/catalog and deleted original jobs', async () => {
  for (const mutate of [
    f => { f.records.delete('orders/' + f.orderId + '/printIntents/original'); },
    f => { f.records.get('orders/' + f.orderId + '/printIntents/original').policyRevision = 999; },
    f => { f.records.get(rulesPath).revision += 1; },
    f => { const printer = structuredClone(f.records.get(printerPath('pizza'))); printer.configuration.id = 'newprinter'; printer.configuration.name = 'newprinter';
      f.records.set(printerPath('newprinter'), printer);
      f.records.get(policyPath).targets.push({ printerId: 'newprinter', printerRevision: 1, kinds: ['kitchen'] });
      f.records.get(rulesPath).rules.push({ id: 'new-rule', brandId: 'b', locationId: 'l', printerId: 'newprinter', match: { type: 'category', id: 'pizza' }, effect: 'include' }); },
    f => { f.records.get('orders/' + f.orderId + '/printIntents/original').targets[0].lineIds = Array.from({ length: 51 }, (_, i) => 'line-' + i); },
    f => { f.order().productItems[0].name = 'Changed pizza'; },
    f => { f.records.get(policyPath).targets = f.records.get(policyPath).targets.slice(0, 1);
      f.records.get(rulesPath).rules = f.records.get(rulesPath).rules.filter(rule => rule.printerId === 'pizza'); },
    f => { const [path, job] = f.jobs()[0]; f.records.delete(path);
      const ledger = f.records.get(printerPath(job.printerId) + '/queue/state'); ledger.pendingCount = 0; ledger.oldestPendingAt = null; },
  ]) {
    const f = await fixture(); await f.settle(); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.settle()); assert.deepEqual([...f.records], before); assert.equal(f.jobs().length <= 2, true);
  }
});

test('#349 valid provider origin/serialized objects cannot mint the private financial plan capability', async () => {
  const f = await fixture(), origin = await f.origins.verifyStripePrintPayment(f.session.id), before = structuredClone([...f.records]);
  assert.deepEqual(Object.keys(f.settlement).sort(), ['readStripeSettlementPrintCapability', 'readPickupSettlementPrintCapability', 'settlePaidCheckoutSession', 'settlePaidPickupOrder', 'settleTerminalPickupOrder'].sort());
  // The new guarded terminal entry point accepts no caller authority. Even a
  // valid provider proof or forged session passed as an extra argument cannot
  // replace the required dedicated cookie, despite this fixture's admin identity.
  for (const forged of [origin, { kind: 'terminal', actorId: f.actorId, brandId: 'b', locationId: 'l' }]) {
    await assert.rejects(f.settlement.settleTerminalPickupOrder(f.orderId, 'cash', forged), error => error.status === 401);
  }
  for (const fake of [{}, origin, JSON.parse(JSON.stringify(origin)), null]) {
    await assert.rejects(f.db.runTransaction(transaction => f.outbox.prepareStripeSettlementPrintIntents({ db: f.db, transaction }, fake, { intents: [] })), /Unverified settlement print capability/);
  }
  assert.deepEqual([...f.records], before); assert.equal(writes(f).length, 0);
});

test('#349 proof expiry after financial apply still aborts the shared transaction before job output', async () => {
  const realTime = Date.now; let time = realTime(); Date.now = () => time;
  try {
    const f = await fixture({ afterWrite: path => { if (path.startsWith('orderNotificationJobs/')) time += 300000; } });
    const before = structuredClone([...f.records]); await assert.rejects(f.settle(), /proof_expired/);
    assert.deepEqual([...f.records], before); assert.ok(writes(f).some(event => event.path.startsWith('orders/')));
    assert.equal(writes(f).some(event => event.path.includes('/jobs/')), false);
  } finally { Date.now = realTime; }
});

test('#349 corrupt stored manifest target/kind/text bounds reject before any replay write', async () => {
  for (const mutate of [
    manifest => { manifest.targets = Array.from({ length: 17 }, (_, i) => ({ ...manifest.targets[0], printerId: 'extra' + i })); },
    manifest => { manifest.targets[0].kinds = ['kitchen', 'packing', 'kitchen']; },
    manifest => { manifest.catalogHash = 'a'.repeat(1000000); },
    manifest => { manifest.targets[0].printerId = 'a'.repeat(1000000); },
    manifest => { for (let i = 0; i < 14; i++) manifest['unknown' + i] = true; },
  ]) {
    const f = await fixture(); await f.settle();
    mutate(f.records.get('orders/' + f.orderId + '/printIntents/original'));
    const before = structuredClone([...f.records]), priorWrites = writes(f).length;
    await assert.rejects(f.settle(), /job_conflict/);
    assert.deepEqual([...f.records], before); assert.equal(writes(f).length, priorWrites); assert.equal(f.jobs().length, 2);
  }
});

test('#349 Paid replay requires each original job revision to match its immutable manifest and current printer', async () => {
  for (const printerId of ['packing', 'pizza']) {
    const f = await fixture(); await f.settle();
    const originalJobs = structuredClone(f.jobs());
    const originalManifest = structuredClone(f.records.get('orders/' + f.orderId + '/printIntents/original'));
    const confirmationPath = [...f.records].find(([path, row]) => path.startsWith('orderNotificationJobs/') && row.kind === 'orderConfirmation')[0];
    f.records.delete(confirmationPath);
    assert.equal(await f.settle(), false, 'valid original revisions still permit the existing confirmation repair');
    assert.deepEqual(f.jobs(), originalJobs);
    assert.deepEqual(f.records.get('orders/' + f.orderId + '/printIntents/original'), originalManifest);
    assert.equal(f.records.has(confirmationPath), true);
    f.records.delete(confirmationPath);
    const job = f.jobs().find(([, row]) => row.printerId === printerId)[1];
    job.printerRevision += 1; // Still a valid stored queued-job shape; only immutable revision identity is inconsistent.
    const before = structuredClone([...f.records]), priorWrites = writes(f).length;
    await assert.rejects(f.settle(), /job_conflict/);
    assert.deepEqual([...f.records], before); assert.equal(writes(f).length, priorWrites);
    assert.equal(f.records.has(confirmationPath), false, 'conflicting original job must also block financial replay repairs');
  }
});

test('#349 terminal Paid replays repair notifications without creating or changing print intents', async () => {
  for (const status of ['Completed', 'Delivered', 'Error', 'Canceled']) {
    for (const originallyPrinted of [false, true]) {
      const f = await fixture();
      if (!originallyPrinted) process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'false';
      try { assert.equal(await f.settle(), true); }
      finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
      f.order().status = status;
      const printRecords = structuredClone([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)));
      const confirmationPath = [...f.records].find(([path, row]) => path.startsWith('orderNotificationJobs/') && row.kind === 'orderConfirmation')[0];
      f.records.delete(confirmationPath);
      const customerBefore = structuredClone(f.records.get('customers/' + f.order().customerDetails.id));
      const providerRequests = f.requests.length;
      assert.equal(await f.settle(), false);
      assert.equal(f.requests.length, providerRequests, 'terminal replay needs no print proof retrieval');
      assert.equal(f.records.has(confirmationPath), status !== 'Canceled');
      assert.deepEqual([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)), printRecords);
      assert.deepEqual(f.records.get('customers/' + f.order().customerDetails.id), customerBefore);
      assert.equal(f.order().status, status); assert.equal(f.order().paymentStatus, 'Paid');
      const before = structuredClone([...f.records]); assert.equal(await f.settle(), false); assert.deepEqual([...f.records], before);
    }
  }
});

test('#349 terminal Paid replay still rejects foreign sessions and payment amounts before any write', async () => {
  for (const patch of [{ id: 'cs_test_foreign_reference' }, { amount_total: 1 }, { currency: 'eur' }, { metadata: { orderId: 'other', brandId: 'b', locationId: 'l' } }]) {
    const f = await fixture(); assert.equal(await f.settle(), true); f.order().status = 'Completed';
    Object.assign(f.session, patch); const before = structuredClone([...f.records]), priorWrites = writes(f).length;
    await assert.rejects(f.settle()); assert.deepEqual([...f.records], before); assert.equal(writes(f).length, priorWrites);
  }
});


test('#349 terminal replay decision is re-read in the settlement transaction after preflight', async () => {
  let changeStatus;
  const f = await fixture({ afterPreflight: state => { if (changeStatus) state.order().status = changeStatus; } });
  assert.equal(await f.settle(), true);
  changeStatus = 'Completed'; const originalPrint = structuredClone([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)));
  assert.equal(await f.settle(), false);
  assert.equal(f.order().status, 'Completed');
  assert.deepEqual([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)), originalPrint);
  // A terminal preflight cannot grant a print transition if the order changes.
  changeStatus = 'Ready'; const priorWrites = writes(f).length;
  await assert.rejects(f.settle(), /verified payment origin required/);
  assert.equal(writes(f).length, priorWrites);
  assert.deepEqual([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)), originalPrint);
});


test('#349 terminal Paid replay ignores malformed or stale print policy before notification repair', async () => {
  const corruptions = [
    state => { state.records.get(policyPath).enabled = 'invalid'; },
    state => { state.records.delete(printerPath('pizza')); },
    state => { state.records.get(printerPath('pizza')).configuration.state = 'disabled'; },
  ];
  for (const status of ['Completed', 'Delivered', 'Error', 'Canceled']) {
    for (const originallyPrinted of [false, true]) {
      for (const corrupt of corruptions) {
        const f = await fixture();
        if (!originallyPrinted) process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'false';
        try { assert.equal(await f.settle(), true); }
        finally { process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'true'; }
        f.order().status = status; corrupt(f);
        const confirmationPath = [...f.records].find(([path, row]) => path.startsWith('orderNotificationJobs/') && row.kind === 'orderConfirmation')[0];
        f.records.delete(confirmationPath);
        const before = structuredClone([...f.records]), requestsBefore = f.requests.length, attemptsBefore = f.attempts.length;
        assert.equal(await f.settle(), false);
        assert.equal(f.records.has(confirmationPath), status !== 'Canceled');
        assert.deepEqual([...f.records].filter(([path]) => path !== confirmationPath), before);
        assert.equal(f.requests.length, requestsBefore);
        assert.equal(f.attempts.slice(attemptsBefore).flatMap(attempt => attempt.events).some(event => event.method === 'get' && /printIntentPolicies|printerRouting|\/printers\//.test(event.path)), false, 'terminal replay must not read print policy or targets in either transaction');
      }
    }
  }
});

test('#349 write transaction and SDK retry inspect fresh terminal order before malformed print policy', async () => {
  let terminalize = false;
  const f = await fixture({ afterPreflight: state => {
    if (terminalize) { state.order().status = 'Delivered'; state.records.get(policyPath).enabled = 'invalid'; }
  } });
  assert.equal(await f.settle(), true);
  const confirmationPath = [...f.records].find(([path, row]) => path.startsWith('orderNotificationJobs/') && row.kind === 'orderConfirmation')[0];
  f.records.delete(confirmationPath); terminalize = true;
  const requestsBefore = f.requests.length, attemptsBefore = f.attempts.length;
  const printBefore = structuredClone([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)));
  assert.equal(await f.settle(), false);
  assert.equal(f.requests.length, requestsBefore + 1, 'nonterminal preflight may already request proof');
  assert.equal(f.records.has(confirmationPath), true);
  assert.deepEqual([...f.records].filter(([path]) => /printIntents|\/printers\//.test(path)), printBefore);
  assert.equal(f.attempts.slice(attemptsBefore).filter(attempt => !attempt.readOnly).flatMap(attempt => attempt.events).some(event => /printIntentPolicies|printerRouting|\/printers\//.test(event.path)), false);

  const retried = await fixture({ retry: true, onRetry: state => { state.records.get(policyPath).enabled = 'invalid'; } });
  Object.assign(retried.order(), { paymentStatus: 'Paid', status: 'Completed' });
  const retryBefore = structuredClone([...retried.records]);
  assert.equal(await retried.settle(), false);
  assert.equal(retried.attempts.filter(attempt => !attempt.readOnly).length, 2);
  assert.equal(retried.requests.length, 0);
  assert.equal(retried.attempts.flatMap(attempt => attempt.events).some(event => /printIntentPolicies|printerRouting|\/printers\//.test(event.path)), false);
  assert.deepEqual([...retried.records].filter(([path]) => !path.startsWith('orderNotificationJobs/') && path !== policyPath), retryBefore.filter(([path]) => !path.startsWith('orderNotificationJobs/') && path !== policyPath));
  assert.equal([...retried.records].filter(([path, row]) => path.startsWith('orderNotificationJobs/') && row.kind === 'orderConfirmation').length, 1);
});

function freeCardSnapshot(order) {
  const amountOre=Math.round(order.paymentDetails.subtotal*100);
  order.discountCard={brandId:'b',locationId:'l',customerId:order.customerDetails.id,memberId:'member',assignmentId:'assignment',groupId:'family',groupName:'Family',percentage:100,
    featureVersion:1,groupVersion:1,assignmentVersion:1,eligibleSubtotalOre:amountOre,amountOre,purchaseStampsEligible:false};
  order.totalAmount=0;
  Object.assign(order.paymentDetails,{itemDiscountTotal:0,cartDiscountTotal:amountOre/100,discountTotal:amountOre/100,deliveryFee:0,bagFee:0,adminFee:0});
}
test('100% personal card: independently verified completed zero-cost Stripe session settles and prints once',async()=>{
 const f=await fixture();freeCardSnapshot(f.order());Object.assign(f.session,{payment_status:'no_payment_required',amount_total:0});
 assert.equal(await f.settle(),true);assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().totalAmount,0);assert.equal(f.jobs().length,2);
 const before=structuredClone([...f.records]);assert.equal(await f.settle(),false);assert.deepEqual([...f.records],before);
});
for(const [label,change] of [
 ['setup-mode',f=>f.session.mode='setup'],['incomplete',f=>f.session.status='open'],['nonzero-provider',f=>f.session.amount_total=1],
 ['no-card',f=>delete f.order().discountCard],['wrong-card-brand',f=>f.order().discountCard.brandId='foreign'],
 ['residual-fee',f=>f.order().paymentDetails.deliveryFee=1],['partial-discount',f=>f.order().discountCard.percentage=99],
 ['wrong-owner',f=>f.order().discountCard.customerId='other'],
])test('zero-cost card refuses '+label,async()=>{
 const f=await fixture();freeCardSnapshot(f.order());Object.assign(f.session,{payment_status:'no_payment_required',amount_total:0});change(f);
 try {assert.equal(await f.settle(),false);}catch(error){assert.match(error.message,/unverified|mismatch/);}
 assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);
});

test('decimal card rounding to full subtotal settles zero-cost order',async()=>{
 const f=await fixture();freeCardSnapshot(f.order());
 f.order().paymentDetails.subtotal=10;freeCardSnapshot(f.order());f.order().discountCard.percentage=99.99;
 Object.assign(f.session,{payment_status:'no_payment_required',amount_total:0});
 assert.equal(await f.settle(),true);assert.equal(f.order().paymentStatus,'Paid');
});

function activatePermanent(f) {
 const now=Date.now(),epoch='A'.repeat(43);
 f.records.set('brands/b/printSettings/automatic',{schemaVersion:1,brandId:'b',enabled:true,revision:1,enabledAt:now-2000,activationId:epoch,updatedAt:now-2000});
 f.order().createdAt={seconds:Math.floor((now-1000)/1000),nanoseconds:((now-1000)%1000)*1000000};
 for(const printerId of ['pizza','packing']){
  f.records.get(printerPath(printerId)).configuration.state='active';
  f.records.set(printerPath(printerId)+'/deviceCredentials/current',f.load('src/lib/printing/device-auth.ts').createPrinterDeviceCredentialDraft({brandId:'b',locationId:'l',printerId,printerRevision:1,credentialRevision:1}).record);
 }
 return epoch;
}
test('permanent Stripe producer commits activation-bound manifest and jobs, without a test window; replay does not recreate',async()=>{
 const before=process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED='true';
 try{const f=await fixture(),epoch=activatePermanent(f);f.records.delete(policyPath);
  assert.equal(await f.settle(),true);assert.equal(f.jobs().length,2);
  assert.ok(f.jobs().every(([,job])=>job.automaticActivationId===epoch));
  assert.equal(f.records.get(`orders/${f.orderId}/printIntents/original`).automaticActivationId,epoch);
  const original=structuredClone([...f.records]);assert.equal(await f.settle(),false);assert.deepEqual([...f.records],original);
 }finally{if(before===undefined)delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=before;}
});
test('permanent policy suppresses old orders, unsupported combos and disabled printing without blocking payment',async()=>{
 const before=process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED='true';
 try{for(const mode of ['old','combo','off']){const f=await fixture();activatePermanent(f);
  if(mode==='old')f.order().createdAt={seconds:1,nanoseconds:0};
  if(mode==='combo')f.order().productItems.push({...f.order().productItems[0],itemType:'combo',comboSelections:[]});
  if(mode==='off')Object.assign(f.records.get('brands/b/printSettings/automatic'),{enabled:false,enabledAt:null,activationId:null});
  assert.equal(await f.settle(),true,mode);assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.jobs().length,0,mode);
 }}finally{if(before===undefined)delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=before;}
});
