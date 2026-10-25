const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
class AuthorityError extends Error { constructor(code, status = 403) { super(code); this.status = status; } }
const now = new Date('2026-10-25T12:00:00Z');
function order(id, extra = {}) { return { id, brandId: 'b1', locationId: 'l1', customerName: 'Anna', status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup', createdAt: now, fulfillmentAt: now, productItems: [], ...extra }; }
function fixture({ rows = [], grants = [{ brandId: 'b1', locationIds: ['l1'] }], edit = true, denyView = false, failure = null, foreignLocation = false } = {}) {
  const reads = [], access = [];
  const locs = [{ id: 'l1', name: 'Amager', brandId: foreignLocation ? 'b2' : 'b1' }, { id: 'l2', name: 'Other', brandId: 'b2' }];
  const snap = data => ({ id: data?.id, exists: Boolean(data), data: () => data });
  function query(collection, predicates = [], after = null, limit = Infinity, sort = false) {
    return {
      where: (...p) => query(collection, [...predicates, p], after, limit, sort),
      orderBy: field => { assert.equal(field, '__name__'); return query(collection, predicates, after, limit, true); },
      startAfter: value => query(collection, predicates, value, limit, sort),
      limit: value => query(collection, predicates, after, value, sort),
      get: async () => {
        if (failure && collection === 'orders') throw failure;
        reads.push({ collection, predicates, after, limit });
        assert(Number.isFinite(limit), 'every collection query bounded');
        let data = collection === 'orders' ? rows : locs;
        data = data.filter(d => predicates.every(([field, op, value]) => { assert.equal(op, '=='); return d[field] === value; }));
        if (sort) data = [...data].sort((a, b) => a.id.localeCompare(b.id));
        if (after) data = data.filter(d => d.id > after);
        return { docs: data.slice(0, limit).map(snap) };
      },
      doc: key => ({ get: async () => snap(collection === 'brands' ? { id: key, name: key } : locs.find(l => l.id === key)) }),
    };
  }
  const mocks = {
    'server-only': {}, 'firebase-admin/firestore': { FieldPath: { documentId: () => '__name__' } },
    '@/lib/firebase-admin': { getAdminDb: () => ({ collection: name => query(name) }) },
    '@/lib/access/authority': { AuthorityError },
    '@/lib/access/orderfly-session': {
      orderflyReadGrants: async permission => { assert.equal(permission, 'orderfly.orders:view'); if (denyView) throw new AuthorityError('forbidden'); return grants; },
      requireOrderflyAccess: async (...args) => { access.push(args); if (args[2].endsWith(':edit') && !edit) throw new AuthorityError('forbidden'); return {}; },
    },
  };
  const api = loadTs('src/lib/orders/terminal-read.ts', mocks);
  return { ...api, reads, access, mocks };
}
test('returns only freshly granted native location and queries every status with exact scope and bounded limit', async () => {
  const f = fixture({ rows: [order('a'), order('foreign', { brandId: 'b2', locationId: 'l2' })] });
  const result = await f.readTerminalOrders({}, now);
  assert.deepEqual(result.orders.map(o => o.id), ['a']); assert.equal(result.canEdit, true);
  assert.deepEqual(result.locations, [{ brandId: 'b1', brandName: 'b1', locationId: 'l1', locationName: 'Amager' }]);
  assert.deepEqual(f.access, [['b1', ['l1'], 'orderfly.orders:view'], ['b1', ['l1'], 'orderfly.orders:edit']]);
  for (const read of f.reads.filter(r => r.collection === 'orders')) {
    assert.equal(read.limit, 51); assert.deepEqual(read.predicates.slice(0, 2), [['brandId', '==', 'b1'], ['locationId', '==', 'l1']]);
  }
});
test('revoked view, forged scope and foreign native location never read order data', async () => {
  for (const options of [{ denyView: true }, { foreignLocation: true }, {}]) {
    const f = fixture(options);
    await assert.rejects(f.readTerminalOrders({ brandId: 'b2', locationId: 'l2' }, now));
    assert.equal(f.reads.filter(r => r.collection === 'orders').length, 0);
  }
});
test('read-only location has canEdit false and authority infrastructure errors are not treated as permissions', async () => {
  const f = fixture({ edit: false }); assert.equal((await f.readTerminalOrders({}, now)).canEdit, false);
  const broken = fixture(); broken.mocks['@/lib/access/orderfly-session'].requireOrderflyAccess = async () => { throw new AuthorityError('identity_unavailable', 503); };
  const service = loadTs('src/lib/orders/terminal-read.ts', broken.mocks);
  await assert.rejects(service.readTerminalOrders({}, now), e => e.status === 503);
});
test('large status pages use cursor without overlap or silent truncation', async () => {
  const f = fixture({ rows: Array.from({ length: 127 }, (_, i) => order(`o${String(i).padStart(3, '0')}`)) });
  let cursor, ids = [], pages = 0;
  do {
    const page = await f.readTerminalOrders({ cursor }, now); pages++;
    ids.push(...page.orders.map(o => o.id)); cursor = page.nextCursor || undefined;
    assert.equal(page.hasMore, Boolean(cursor));
  } while (cursor);
  assert.equal(pages, 3); assert.equal(ids.length, 127); assert.equal(new Set(ids).size, 127);
});
test('empty filtered scan page retains cursor; cursor cannot switch scope or filters', async () => {
  const f = fixture({ rows: Array.from({ length: 55 }, (_, i) => order(`o${String(i).padStart(3, '0')}`, { customerName: i === 54 ? 'Wanted' : 'Other' })) });
  const first = await f.readTerminalOrders({ search: 'Wanted' }, now);
  assert.equal(first.orders.length, 0); assert.equal(first.hasMore, true);
  const second = await f.readTerminalOrders({ search: 'Wanted', cursor: first.nextCursor }, now);
  assert.deepEqual(second.orders.map(o => o.id), ['o054']);
  await assert.rejects(f.readTerminalOrders({ cursor: first.nextCursor }, now), e => e.code === 'terminal_invalid');
});
test('Copenhagen future-day routing uses authoritative timestamps through DST and preserves same-day scheduled board', async () => {
  const clock = new Date('2026-10-24T22:30:00Z'); // 25 October in Copenhagen, DST transition day.
  const f = fixture({ rows: [order('today', { fulfillmentAt: new Date('2026-10-25T21:30:00Z') }), order('tomorrow', { fulfillmentAt: new Date('2026-10-25T23:30:00Z') }), order('legacy', { fulfillmentAt: 'not a date' })] });
  assert.deepEqual((await f.readTerminalOrders({ view: 'board' }, clock)).orders.map(o => o.id).sort(), ['legacy', 'today']);
  assert.deepEqual((await f.readTerminalOrders({ view: 'preorders' }, clock)).orders.map(o => o.id), ['tomorrow']);
});
test('unpaid online, failed and invalid accepted-pickup records never reach active queues', async () => {
  const f = fixture({ rows: [order('online', { paymentStatus: 'Pending' }), order('failed', { paymentStatus: 'Failed' }), order('pickup', { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'held' }), order('badpickup', { paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', discountReservation: 'held', psp: {} })] });
  assert.deepEqual((await f.readTerminalOrders({}, now)).orders.map(o => o.id), ['pickup']);
  assert.equal((await f.readTerminalOrders({ view: 'history' }, now)).orders.length, 4);
});
test('history date filtering uses Copenhagen created day; malformed dates are not invented', async () => {
  const f = fixture({ rows: [order('a', { createdAt: new Date('2026-10-24T23:30:00Z') }), order('b', { createdAt: new Date('2026-10-25T23:30:00Z') }), order('bad', { createdAt: 'invalid' })] });
  assert.deepEqual((await f.readTerminalOrders({ view: 'history', dateFrom: '2026-10-25', dateTo: '2026-10-25' }, now)).orders.map(o => o.id), ['a']);
  assert.equal((await f.readTerminalOrders({ view: 'history' }, now)).orders.find(o => o.id === 'bad').createdAt, null);
});
test('projection contains food modifiers and operational fields, never provider/payment secret payload', () => {
  const f = fixture(); const row = f.projectTerminalOrder('x', order('x', { psp: { secret: 'hidden' }, productItems: [{ name: 'Pizza', quantity: 2, unitPrice: 10, totalPrice: 20, toppings: ['Svampe'], comboSelections: [{ groupName: 'Drink', products: [{ name: 'Faxe' }] }] }], customerDetails: { phone: '123', address: 'Street', deliveryInstructions: 'Ring' } }));
  assert.deepEqual(row.items[0].modifiers, ['Svampe', 'Drink: Faxe']); assert.equal(row.notes, 'Ring'); assert.equal(row.customerPhone, '123');
  assert.equal(JSON.stringify(row).includes('hidden'), false); assert.equal('psp' in row, false);
});
test('invalid query, duplicate/unknown keys, dates and cursor fail closed', async () => {
  const f = fixture(); for (const q of [{ brandId: 'b1' }, { dateFrom: '2026-02-30' }, { dateFrom: '2026-10-26', dateTo: '2026-10-25' }, { view: 'all' }, { search: 'x'.repeat(101) }, { cursor: '!!!' }, { extra: true }]) await assert.rejects(f.readTerminalOrders(q, now));
  const route = loadTs('src/app/api/merchant/orders/route.ts', { ...f.mocks, '@/lib/orders/terminal-read': f });
  assert.equal((await route.GET(new Request('https://example.test/api/merchant/orders?view=board&view=history'))).status, 400);
});
test('HTTP operational failures are sanitized and never masquerade as successful empty results', async () => {
  const f = fixture({ failure: new Error('private database details') });
  const route = loadTs('src/app/api/merchant/orders/route.ts', { ...f.mocks, '@/lib/orders/terminal-read': f });
  const response = await route.GET(new Request('https://example.test/api/merchant/orders'));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'terminal_unavailable' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('oversized grant sets fail explicitly instead of silently truncating location choices', async () => {
  const f = fixture({ grants: Array.from({ length: 201 }, (_, i) => ({ brandId: `b${i}`, locationIds: [] })) });
  await assert.rejects(f.readTerminalOrders({}, now), e => e.code === 'terminal_scope_too_large' && e.status === 409);
  assert.equal(f.reads.length, 0);
});
test('all-location grants still query native locations by brand; no locations means no order read', async () => {
  const f = fixture({ grants: [{ brandId: 'b1', locationIds: null }] });
  const result = await f.readTerminalOrders({}, now); assert.deepEqual(result.locations.map(l => l.locationId), ['l1']);
  const empty = fixture({ grants: [{ brandId: 'b1', locationIds: [] }] });
  const blank = await empty.readTerminalOrders({}, now); assert.equal(blank.selectedLocationId, null); assert.equal(blank.canEdit, false);
  assert.equal(empty.reads.filter(r => r.collection === 'orders').length, 0);
});
