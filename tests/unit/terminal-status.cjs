const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { randomUUID } = require('node:crypto');
class AuthorityError extends Error { constructor(code, status = 403) { super(code); this.code = code; this.status = status; } }
const command = (extra = {}) => ({ orderId: 'order-a', brandId: 'brand-a', locationId: 'location-a', expectedStatus: 'Received', status: 'In Progress', requestId: randomUUID(), ...extra });
function fixture(options = {}) {
  const rows = new Map([['orders/order-a', { brandId: 'brand-a', locationId: 'location-a', status: 'Received', deliveryType: 'Pickup', paymentStatus: 'Paid', paymentMethod: 'Stripe', ...options.order }]]);
  const writes = [], calls = [], mail = [];
  let denied = false, lock = Promise.resolve();
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), runTransaction: run => {
    const operation = lock.then(async () => {
      const attempt = async commit => {
        const pending = []; let writing = false;
        const tx = { get: async ref => { assert.equal(writing, false, 'all reads must precede writes'); const value = rows.get(ref.path); return { exists: !!value, data: () => value && structuredClone(value) }; },
          update: (ref, value) => { writing = true; pending.push(['update', ref.path, value]); },
          create: (ref, value) => { writing = true; assert.equal(rows.has(ref.path), false); pending.push(['create', ref.path, value]); } };
        const result = await run(tx);
        if (commit && !options.failCommit) { for (const [kind, path, value] of pending) rows.set(path, kind === 'update' ? { ...rows.get(path), ...value } : value); writes.push(...pending); }
        else if (options.failCommit) throw Error('database private failure');
        return result;
      };
      if (options.retry) { await attempt(false); options.retry(rows); options.retry = null; }
      return attempt(true);
    });
    lock = operation.catch(() => {}); return operation;
  }};
  const mocks = {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db, getAdminFieldValue: () => ({ serverTimestamp: () => 'SERVER_TIME' }) },
    '@/lib/access/orderfly-session': { verifiedOrderflyIdentity: async () => { if (options.sessionError) throw options.sessionError; return { provider: 'firebase', subject: 'actor' }; } },
    '@/lib/access/authority': { AuthorityError, principalKey: () => 'actor-key' },
    '@/lib/access/scoped-data': { authorizeTransaction: async (tx, identity, order, permission, kind) => { calls.push({ identity, order, permission, kind }); if (denied || options.deny) throw new AuthorityError('forbidden'); } },
    '@/lib/feedback/mail-queue': { queueOrderFeedback: async (...args) => { mail.push(args); if (options.mailFail) throw Error('optional mail'); } },
  };
  const service = loadTs('src/lib/orders/terminal-status.ts', mocks);
  return { ...service, rows, writes, calls, mail, revoke: () => { denied = true; }, mocks };
}
test('complete pickup progression writes audit atomically without financial changes', async () => {
  const f = fixture();
  for (const [expectedStatus, status] of [['Received', 'In Progress'], ['In Progress', 'Ready'], ['Ready', 'Completed']]) {
    const result = await f.progressTerminalOrder(command({ expectedStatus, status }));
    assert.deepEqual(result, { success: true, changed: true, orderId: 'order-a', status });
  }
  assert.equal(f.writes.length, 6);
  assert.deepEqual(f.writes.filter(x => x[0] === 'update').map(x => Object.keys(x[2])), Array(3).fill(['status', 'updatedAt']));
  assert.equal(f.calls.every(c => c.permission === 'orderfly.orders:edit' && c.kind === 'location'), true);
  assert.equal(f.rows.get('orders/order-a').paymentStatus, 'Paid');
  assert.deepEqual(f.mail, [['order-a', true]]);
  assert.equal(f.writes.filter(x => x[0] === 'create').every(x => x[2].actorId === 'actor-key' && x[2].createdAt === 'SERVER_TIME'), true);
});
test('delivery completion is Delivered, never pickup Completed', async () => {
  const f = fixture({ order: { status: 'Ready', deliveryType: 'Delivery' } });
  await assert.rejects(f.progressTerminalOrder(command({ expectedStatus: 'Ready', status: 'Completed' })), /terminal_status_conflict/);
  assert.equal((await f.progressTerminalOrder(command({ expectedStatus: 'Ready', status: 'Delivered' }))).status, 'Delivered');
});
test('unpaid accepted pickup can prepare and become Ready but must record payment separately', async () => {
  const f = fixture({ order: { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'held' } });
  await f.progressTerminalOrder(command());
  await f.progressTerminalOrder(command({ expectedStatus: 'In Progress', status: 'Ready' }));
  await assert.rejects(f.progressTerminalOrder(command({ expectedStatus: 'Ready', status: 'Completed' })), /terminal_payment_required/);
  assert.equal(f.rows.get('orders/order-a').status, 'Ready'); assert.equal(f.writes.length, 4); assert.equal(f.mail.length, 0);
});
test('unpaid online and malformed pickup eligibility never change fulfillment', async () => {
  for (const patch of [
    { paymentStatus: 'Pending' }, { paymentStatus: 'Failed' },
    { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'released' },
    { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'held', psp: {} },
    { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'held', deliveryType: 'Delivery' },
  ]) { const f = fixture({ order: patch }); await assert.rejects(f.progressTerminalOrder(command()), /terminal_payment_required/); assert.deepEqual(f.writes, []); }
});
test('terminal, pending, canceled and skipped/reversed status changes are rejected', async () => {
  for (const status of ['Pending', 'Canceled', 'Error', 'Completed', 'Delivered']) {
    const f = fixture({ order: { status } }); await assert.rejects(f.progressTerminalOrder(command()), /terminal_status_conflict/); assert.deepEqual(f.writes, []);
  }
  const f = fixture(); await assert.rejects(f.progressTerminalOrder(command({ status: 'Ready' })), /terminal_status_conflict/);
  await assert.rejects(f.progressTerminalOrder(command({ expectedStatus: 'Ready', status: 'Completed' })), /terminal_status_conflict/); assert.deepEqual(f.writes, []);
});
test('same request replay is idempotent, even after another forward transition', async () => {
  const f = fixture(), first = command(); await f.progressTerminalOrder(first);
  await f.progressTerminalOrder(command({ expectedStatus: 'In Progress', status: 'Ready' }));
  assert.deepEqual(await f.progressTerminalOrder(first), { success: true, changed: false, orderId: 'order-a', status: 'Ready' });
  assert.equal(f.writes.length, 4); assert.equal(f.calls.length, 3);
  await assert.rejects(f.progressTerminalOrder({ ...first, expectedStatus: 'Ready', status: 'Completed' }), /terminal_status_conflict/);
});
test('two tablet clicks cannot perform the same transition twice', async () => {
  const f = fixture(), results = await Promise.allSettled([f.progressTerminalOrder(command()), f.progressTerminalOrder(command())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'terminal_status_conflict'); assert.equal(f.writes.length, 2);
});
test('missing/foreign scope and revoked edit permission reject without writes or feedback', async () => {
  for (const patch of [{ orderId: 'missing' }, { brandId: 'foreign' }, { locationId: 'foreign' }]) {
    const f = fixture(); await assert.rejects(f.progressTerminalOrder(command(patch)), /forbidden/); assert.deepEqual(f.writes, []);
  }
  const f = fixture(), request = command(); await f.progressTerminalOrder(request); f.revoke();
  await assert.rejects(f.progressTerminalOrder(request), /forbidden/); assert.equal(f.writes.length, 2);
});
test('transaction retry rechecks changed scope and payment; aborted writes do not escape', async () => {
  for (const patch of [{ brandId: 'foreign' }, { locationId: 'foreign' }, { paymentStatus: 'Failed' }]) {
    const f = fixture({ retry: rows => rows.set('orders/order-a', { ...rows.get('orders/order-a'), ...patch }) });
    await assert.rejects(f.progressTerminalOrder(command()), /forbidden|terminal_payment_required/); assert.deepEqual(f.writes, []); assert.deepEqual(f.mail, []);
  }
  const f = fixture({ failCommit: true }); await assert.rejects(f.progressTerminalOrder(command()), /database/); assert.equal(f.rows.get('orders/order-a').status, 'Received'); assert.deepEqual(f.writes, []);
});
test('validation rejects unexpected fields, paths, invalid IDs and payment mutations before auth', async () => {
  for (const patch of [{ orderId: '../order' }, { requestId: 'not-uuid' }, { status: 'Paid' }, { paymentStatus: 'Paid' }, { expectedStatus: 'Pending' }, { locationId: '' }]) {
    const f = fixture(); await assert.rejects(f.progressTerminalOrder(command(patch)), /terminal_status_invalid/); assert.equal(f.calls.length, 0); assert.deepEqual(f.writes, []);
  }
});
test('optional feedback failure never undoes completion; replay can recover queueing', async () => {
  const f = fixture({ order: { status: 'Ready' }, mailFail: true }), request = command({ expectedStatus: 'Ready', status: 'Completed' });
  assert.equal((await f.progressTerminalOrder(request)).changed, true);
  assert.equal((await f.progressTerminalOrder(request)).changed, false);
  assert.equal(f.writes.length, 2); assert.equal(f.mail.length, 2);
});
function httpFixture(error) {
  const calls = [];
  const service = fixture();
  const route = loadTs('src/app/api/merchant/orders/status/route.ts', {
    'server-only': {}, '@/lib/access/authority': { AuthorityError }, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    '@/lib/orders/terminal-status': { TerminalStatusError: error?.constructor?.name === 'TerminalStatusError' ? error.constructor : service.TerminalStatusError, progressTerminalOrder: async input => { calls.push(input); if (error) throw error; return { success: true, changed: true, orderId: 'order-a', status: 'In Progress' }; } },
  });
  return { ...route, calls, TerminalStatusError: service.TerminalStatusError };
}
const request = (body = command(), headers = {}, url = 'https://orderfly.dk/api/merchant/orders/status') => new Request(url, { method: 'POST', headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
test('HTTP requires same-origin bounded JSON and returns no-store data', async () => {
  const f = httpFixture();
  for (const r of [request({}, { origin: 'https://evil.test' }), request({}, { 'sec-fetch-site': 'cross-site' }), request({}, { 'content-type': 'text/plain' }), request({}, { 'content-encoding': 'gzip' }), request('x'.repeat(4097)), request('{'), request({}, {}, 'https://orderfly.dk/api/merchant/orders/status?x=1')]) {
    assert.ok([400, 403].includes((await f.POST(r)).status));
  }
  assert.equal(f.calls.length, 0);
  const r = await f.POST(request()); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal((await r.json()).success, true);
});
test('HTTP failures are safe and preserve actionable status codes', async () => {
  const type = httpFixture().TerminalStatusError;
  for (const [error, code] of [[new AuthorityError('unauthorized', 401), 401], [new AuthorityError('forbidden'), 403], [new AuthorityError('private identity failure', 503), 503], [new type('terminal_payment_required'), 409], [new type('terminal_status_invalid', 400), 400], [Error('private customer or secret'), 503]]) {
    const f = httpFixture(error), response = await f.POST(request()); assert.equal(response.status, code); const body = await response.json(); assert.equal(body.success, false); assert.equal(JSON.stringify(body).includes('private'), false);
  }
});
test('managed courier completion cannot be forged by kitchen terminal, including corrupt marker',async()=>{
 for(const managedDelivery of [{version:1,providerId:'wolt',quoteRef:'quote',requestDigest:'a'.repeat(64)},{}]){
 const f=fixture({order:{status:'Ready',deliveryType:'Delivery',managedDelivery}});
 await assert.rejects(f.progressTerminalOrder(command({expectedStatus:'Ready',status:'Delivered'})),/terminal_status_conflict/);
 assert.equal(f.rows.get('orders/order-a').status,'Ready');assert.equal(f.writes.length,0);assert.equal(f.mail.length,0);
 }
});
