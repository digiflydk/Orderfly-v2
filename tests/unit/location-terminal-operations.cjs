const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const { AuthorityError } = authority;
async function fixture() {
  const f = await paymentFixture();
  const collection = f.db.collection;
  const wrap = ref => ({ ...ref, collection: child => query(collection(ref.path + '/' + child)) });
  const query = native => ({ ...native, doc: id => wrap(native.doc(id)), where: (...args) => query(native.where(...args)), limit: n => query(native.limit(n)), get: async () => { const result = await native.get(); return { ...result, size: result.docs.length }; } });
  f.db.collection = name => query(collection(name));
  const terminal = Object.freeze({ sessionId: 'a'.repeat(64), actorId: 'b'.repeat(64), brandId: 'b', locationId: 'l', locationName: 'Local', brandName: 'Brand', credentialRevision: 1 });
  const state = { terminal: true, admin: true, revoked: false, authorizations: 0 };
  const core = {
    getTerminalSession: async () => state.terminal ? terminal : null,
    authorizeTerminalTransaction: async (tx, session, brandId, locationId) => {
      state.authorizations++;
      assert.equal(session, terminal, 'opaque core handle remains unchanged');
      if (state.revoked) throw new AuthorityError('unauthorized', 401);
      if (brandId !== terminal.brandId || locationId !== terminal.locationId) throw new AuthorityError('forbidden');
      const location = (await tx.get(f.db.collection('locations').doc(locationId))).data();
      if (location?.brandId !== brandId) throw new AuthorityError('forbidden');
    },
  };
  const adminSession = f.mocks['@/lib/access/orderfly-session'].orderflySession;
  const load = moduleGraph({ ...f.mocks, './core': core, '@/lib/terminal-auth/core': core,
    '@/lib/access/orderfly-session': { ...f.mocks['@/lib/access/orderfly-session'], orderflySession: async () => { if (!state.admin) throw new AuthorityError('unauthorized', 401); return adminSession(); } },
  });
  return { ...f, state, terminal, load, access: load('src/lib/terminal-auth/access.ts'), settlement: load('src/lib/server/settle-checkout.ts'), status: load('src/lib/orders/terminal-status.ts') };
}
async function withPrint(enabled, run) { const saved = process.env.ORDERFLY_PRINT_INTENTS_ENABLED; process.env.ORDERFLY_PRINT_INTENTS_ENABLED = String(enabled); try { await run(); } finally { if (saved === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED; else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = saved; } }
test('fixed actor source never falls back across cookie types and terminal never acquires native identity', async () => {
  const f = await fixture(); f.state.admin = false;
  const actor = await f.access.getOrderTerminalActor('terminal'); assert.equal(actor.kind, 'terminal'); assert.equal(actor.session, f.terminal); assert.equal('identity' in actor, false);
  await assert.rejects(f.access.getOrderTerminalActor('admin'), e => e.status === 401);
  f.state.terminal = false; f.state.admin = true;
  await assert.rejects(f.access.getOrderTerminalActor('terminal'), e => e.status === 401);
  assert.equal((await f.access.getOrderTerminalActor('admin')).kind, 'admin');
});
test('terminal uses full native pickup financial plan with or without print feature, replay does not duplicate invoice/payment', async () => {
  for (const enabled of [false, true]) await withPrint(enabled, async () => {
    const f = await fixture(); f.state.admin = false;
    assert.equal(await f.settlement.settleTerminalPickupOrder(f.orderId, 'cash'), true);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().paymentCollection.employeeId, f.terminal.actorId);
    assert.ok(f.order().invoice.number); const invoice = structuredClone(f.order().invoice);
    assert.equal(await f.settlement.settleTerminalPickupOrder(f.orderId, 'cash'), false);
    assert.deepEqual(f.order().invoice, invoice);
    assert.equal([...f.records.values()].filter(r => r.action === 'pickup_payment_received').length, 1);
    assert.ok(f.state.authorizations >= 2);
    await assert.rejects(f.settlement.settlePaidPickupOrder(f.orderId, 'cash'), e => e.status === 401);
  });
});
test('foreign native scope and revoked terminal cannot settle; records remain unchanged', async () => {
  for (const enabled of [false, true]) for (const mutation of [f => { f.state.revoked = true; }, f => { f.order().locationId = 'other'; }, f => { f.order().brandId = 'other'; }, f => { f.records.get('locations/l').brandId = 'other'; }]) await withPrint(enabled, async () => {
    const f = await fixture(); mutation(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.settlement.settleTerminalPickupOrder(f.orderId, 'card'));
    assert.deepEqual([...f.records], before);
  });
});
test('terminal payment rejects online, unaccepted and canceled orders without financial writes', async () => {
  for (const patch of [{ paymentMethod: 'Stripe' }, { status: 'Pending' }, { status: 'Canceled' }, { discountReservation: 'released' }]) await withPrint(false, async () => {
    const f = await fixture(); Object.assign(f.order(), patch); const before = structuredClone([...f.records]);
    await assert.rejects(f.settlement.settleTerminalPickupOrder(f.orderId, 'cash')); assert.deepEqual([...f.records], before);
  });
});
test('terminal status still enforces payment and revalidates the opaque scoped handle before each write/replay', async () => {
  const f = await fixture(); const command = { orderId: f.orderId, brandId: 'b', locationId: 'l', expectedStatus: 'Received', status: 'In Progress', requestId: '81e4f95c-d155-459e-baf4-1c8f0082f210' };
  assert.equal((await f.status.progressTerminalOrder(command, 'terminal')).changed, true);
  assert.equal((await f.status.progressTerminalOrder(command, 'terminal')).changed, false);
  f.state.revoked = true; await assert.rejects(f.status.progressTerminalOrder(command, 'terminal'), e => e.status === 401);
  assert.equal(f.order().paymentStatus, 'Pending'); assert.equal(f.order().status, 'In Progress');
});
test('dedicated read/status/reprint wrappers choose terminal source server-side', async () => {
  const calls = [];
  const load = moduleGraph({ 'server-only': {}, '@/lib/access/authority': authority, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    '@/lib/orders/terminal-read': { TerminalReadError: class extends Error {}, readTerminalOrders: async (...args) => { calls.push(['read', args.at(-1)]); return {}; } },
    '@/lib/orders/terminal-status': { TerminalStatusError: class extends Error {}, progressTerminalOrder: async (...args) => { calls.push(['status', args.at(-1)]); return {}; } },
    '@/lib/printing/merchant-reprint-http': { handleMerchantReprint: async (...args) => { calls.push(['print', args.at(-1)]); return Response.json({}); } },
  });
  await load('src/app/api/terminal/orders/route.ts').GET(new Request('https://orderfly.dk/api/terminal/orders'));
  await load('src/app/api/terminal/orders/status/route.ts').POST(new Request('https://orderfly.dk/api/terminal/orders/status', { method: 'POST', headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json' }, body: '{}' }));
  await load('src/app/api/terminal/orders/reprint/route.ts').GET(new Request('https://orderfly.dk/api/terminal/orders/reprint'));
  assert.deepEqual(calls, [['read', 'terminal'], ['status', 'terminal'], ['print', true]]);
});
test('payment HTTP rejects caller authority/amount and unsafe requests, sanitizes uncertain errors', async () => {
  let calls = 0;
  const route = moduleGraph({ 'server-only': {}, '@/lib/access/authority': authority, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    '@/lib/server/settle-checkout': { settleTerminalPickupOrder: async () => { calls++; throw Error('PRIVATE_PAYMENT_DATA'); } },
  })('src/app/api/terminal/orders/payment/route.ts');
  const request = (body, headers = {}) => new Request('https://orderfly.dk/api/terminal/orders/payment', { method: 'POST', headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  for (const body of [{ orderId: 'order', method: 'cash', amount: 1 }, { orderId: 'order', method: 'cash', actorId: 'admin' }, { orderId: '../other', method: 'cash' }, { orderId: 'order', method: 'stripe' }]) assert.equal((await route.POST(request(body))).status, 400);
  assert.equal((await route.POST(request({}, { origin: 'https://other.test' }))).status, 403);
  assert.equal(calls, 0);
  const response = await route.POST(request({ orderId: 'order', method: 'cash' })); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE/); assert.equal(response.headers.get('cache-control'), 'no-store');
});
