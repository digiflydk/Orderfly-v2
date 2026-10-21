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
  const load = moduleGraph({ ...f.mocks, stripe: { default: Provider },
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
  assert.deepEqual(Object.keys(f.settlement).sort(), ['readStripeSettlementPrintCapability', 'settlePaidCheckoutSession', 'settlePaidPickupOrder'].sort());
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
