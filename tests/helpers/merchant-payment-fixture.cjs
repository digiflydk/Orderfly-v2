const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const { moduleGraph } = require('./load-ts-graph.cjs');
const { memoryDb } = require('./marketing-db.cjs');
const { checkout } = require('./checkout-fixture.cjs');
const { principalKey, executeAuthority } = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const identity = { provider: 'firebase', subject: 'employee' };
const actorId = principalKey(identity);

async function paymentFixture(options = {}) {
  const created = await checkout({ ...options, realReservations: true,
    brandOverrides: { companyRegNo: '12345678', companyName: 'Fixture ApS', street: 'Testvej 1', zipCode: '2300', city: 'København', country: 'DK', currency: 'DKK', ...options.brandOverrides },
    locationOverrides: { paymentMethods: { online: true, payAtPickup: true }, ...options.locationOverrides },
    customerOverrides: { paymentMethod: 'pay_at_pickup', ...options.customerOverrides } });
  const { records } = created;
  records.set('platformAdminControl/access-v1', {
    principals: [{ id: actorId, active: true, name: 'Testmedarbejder' }],
    companies: [{ id: 'company', active: true, locationIds: ['l'], orderflyBrandIds: ['b'] }],
    roles: [{ id: 'employee', name: 'Employee', companyId: 'company', kind: 'company_user', active: true, permissions: ['orderfly.orders:view', 'orderfly.orders:edit', 'orderfly.catalog:view', 'orderfly.catalog:edit', 'orderfly.analytics:view'] }],
    memberships: [{ id: 'membership', principalId: actorId, companyId: 'company', locationIds: ['l'], roleIds: ['employee'], active: true }],
  });
  const db = memoryDb(records), transact = db.runTransaction;
  db.runTransaction = run => transact(async tx => {
    let writes = false;
    return run({ ...tx, get: ref => { assert.equal(writes, false, 'Firestore reads must precede writes'); return tx.get(ref); },
      set: (...args) => { writes = true; return tx.set(...args); },
      create: (...args) => { writes = true; return tx.create(...args); },
      update: (ref, data) => {
        writes = true;
        const patch = { ...data };
        for (const key of Object.keys(data).filter(key => key.includes('.'))) {
          const [parent, field] = key.split('.');
          patch[parent] = { ...records.get(ref.path)?.[parent], ...patch[parent], [field]: data[key] }; delete patch[key];
        }
        return tx.update(ref, patch);
      },
    });
  });
  const grants = async permission => {
    const result = await executeAuthority(db, identity, { action: 'nativeGrants', product: 'orderfly', permission }, { provider: 'firebase', subject: 'bootstrap' });
    return result.grants.map(grant => ({ brandId: grant.tenantId, locationIds: grant.locationIds }));
  };
  const mocks = { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => db, getAdminFieldValue: () => ({ serverTimestamp: () => new Date() }) },
    '@/lib/access/orderfly-session': { orderflySession: async () => ({ identity, actorId, name: 'Testmedarbejder', superuser: false, permissions: [] }), verifiedOrderflyIdentity: async () => identity, orderflyReadGrants: grants },
    './orderfly-session': { verifiedOrderflyIdentity: async () => identity, orderflyReadGrants: grants },
    '@/lib/analytics-server': { trackServerEvent: async () => {} },
    '@/lib/marketing/config': { paidOrderMarketingEnabled: () => false },
    '@/lib/feedback/mail-queue': { queueOrderFeedback: async () => {} },
    'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  };
  // Native financial proofs depend on module identity. Evaluate this fixture's
  // shared server graph once, as production CommonJS does, with fresh mocks for
  // each fixture. Repeated recursive evaluation also made broad suites stall.
  const load = moduleGraph({ react: require('next/dist/compiled/react'), ...mocks });
  const settlement = load('src/lib/server/settle-checkout.ts');
  const cancellation = load('src/lib/server/pickup-orders.ts');
  const settings = load('src/lib/server/merchant-payment-settings.ts');
  const scoped = load('src/lib/access/scoped-data.ts');
  const requireAccess = async (brandId, locationIds, permission) => db.runTransaction(async tx => {
    await scoped.authorizeTransaction(tx, identity, { brandId, ...(locationIds ? { locationIds } : {}) }, permission, 'locations');
    return { identity, brandId, locationIds };
  });
  mocks['@/lib/access/orderfly-session'].requireOrderflyAccess = requireAccess;
  mocks['./orderfly-session'].requireOrderflyAccess = requireAccess;
  const compat = { db, doc: (_, collection, id) => db.collection(collection).doc(id), serverTimestamp: () => new Date(),
    updateDoc: (ref, data) => ref.update(data),
    runTransaction: (_, run) => db.runTransaction(tx => run({ ...tx, get: async ref => {
      const snap = await tx.get(ref); return { ...snap, exists: () => snap.exists };
    } })),
  };
  const receipts = moduleGraph({ react: require('next/dist/compiled/react'), ...mocks,
    '@/app/checkout/order-actions': { getOrderById: async id => {
      const order = records.get('orders/' + id); return order ? { ...order, id } : null;
    }, getOrderByCheckoutSessionId: async id => {
      const entry = [...records].find(([key, order]) => key.startsWith('orders/') && (order.psp?.checkoutSessionId === id || order['psp.checkoutSessionId'] === id));
      return entry ? { ...entry[1], id: entry[0].slice(7) } : null;
    } },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => { throw Error('Pickup receipts must never load Stripe'); } },
    './settle-checkout': settlement,
  })('src/lib/server/guest-receipt.ts');
  const sales = moduleGraph({ react: require('next/dist/compiled/react'), ...mocks,
    'firebase-admin/firestore': { Timestamp: { fromDate: date => date } },
  })('src/lib/superadmin/getSalesSummary.ts');
  const statuses = load('src/app/superadmin/sales/orders/actions.ts');
  const orderId = created.result.orderId || options.orderId || 'ORD-TEST';
  const kpis = () => [...records].filter(([path]) => path.startsWith('orders/')).map(([, order]) => order).filter(order => order.paymentStatus === 'Paid' && order.status !== 'Canceled');
  return { ...created, db, mocks, actorId, orderId, settlement, cancellation, settings, scoped, compat, receipts, sales, statuses,
    order: () => records.get('orders/' + orderId),
    pay: method => settlement.settlePaidPickupOrder(orderId, method || 'cash'),
    cancel: (cancellationComment = 'Fixture cancellation') => cancellation.cancelUnpaidPickupOrder(orderId, cancellationComment),
    kpis: () => ({ count: kpis().length, amount: kpis().reduce((sum, order) => sum + order.totalAmount, 0) }),
  };
}
module.exports = { paymentFixture, actorId };
