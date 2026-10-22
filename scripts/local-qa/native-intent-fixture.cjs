'use strict';
const assert = require('node:assert/strict'), http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');
const { intentEnvironment } = require('./intent-environment.cjs');
const prefix = 'qa0-intent-';
const scope = Object.freeze({ brandId: prefix + 'brand', locationId: prefix + 'location', orderId: prefix + 'order',
  printerIds: Object.freeze([prefix + 'pizza', prefix + 'packing']) });
const session = Object.freeze({ id: 'cs_test_qa0_native_intent_reference', object: 'checkout.session', mode: 'payment', status: 'complete',
  payment_status: 'paid', currency: 'dkk', amount_total: 10000, payment_intent: 'pi_qa0_native_intent',
  metadata: Object.freeze({ orderId: scope.orderId, brandId: scope.brandId, locationId: scope.locationId }) });
function assertRuntime() {
  for (const [key, value] of Object.entries(intentEnvironment())) {
    if (['PATH', 'LANG', 'TZ'].includes(key)) continue;
    if (process.env[key] !== value) throw Error('QA511 runtime rejected');
  }
  if (Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA511 network guard rejected');
  if (Object.keys(process.env).some(k => !Object.hasOwn(intentEnvironment(), k)
    && /SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK|GCE_METADATA|GOOGLE_METADATA|GOOGLE_OAUTH|GCLOUD_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|STRIPE|SMTP|RESEND|SENDGRID|OMNISEND|MPANEL|WOLT|UBER|GOOGLE_AUTH|PROXY|proxy|PRINT_(?:OUTPUT|DISPATCH)_ENABLED/.test(k))) throw Error('QA511 foreign runtime rejected');
}
async function startProvider() {
  assertRuntime(); let requests = 0, rejected = 0;
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/v1/checkout/sessions/' + session.id
      || req.headers.authorization !== 'Bearer sk_test_orderfly_qa0_synthetic_only') {
      rejected++; res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"fixture rejected"}}');
    }
    requests++; res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(session));
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3100, '127.0.0.1', resolve); });
  return Object.freeze({ counts: () => ({ requests, rejected }), close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(Error('QA511 provider close failed')) : resolve()); server.closeAllConnections();
  }) });
}
function fixtureRows() {
  const b = scope.brandId, l = scope.locationId, o = scope.orderId, c = prefix + 'customer', product = prefix + 'product', category = prefix + 'category';
  const rows = new Map([
    ['brands/' + b, { id: b, name: 'QA511 synthetic restaurant', status: 'active', companyName: 'QA511 Synthetic ApS', companyRegNo: '12345678', street: 'Testvej 1', zipCode: '2300', city: 'København', country: 'DK', currency: 'DKK', vatPercentage: 25 }],
    ['locations/' + l, { id: l, brandId: b, isActive: true, name: 'QA511 synthetic location', address: 'Testvej 1' }],
    ['customers/' + c, { id: c, brandId: b, email: 'synthetic@qa0.example.invalid', totalOrders: 0, totalSpend: 0, marketingConsent: false }],
    ['products/' + product, { id: product, brandId: b, locationIds: [l], categoryId: category, price: 100, isActive: true, productName: 'Synthetic pizza' }],
    ['categories/' + category, { id: category, isActive: true, locationIds: [l] }],
    ['orders/' + o, { id: o, brandId: b, locationId: l, paymentMethod: 'Stripe', paymentStatus: 'Pending', status: 'Pending', deliveryType: 'Pickup', totalAmount: 100,
      customerName: 'Synthetic customer', customerContact: 'synthetic@qa0.example.invalid', customerDetails: { id: c, address: 'For Pickup' },
      paymentDetails: { subtotal: 100 }, productItems: [{ id: product, itemType: 'product', name: 'Synthetic pizza', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      discountReservation: 'none', psp: { checkoutSessionId: session.id } }],
    [`locations/${l}/printIntentPolicies/original`, { schemaVersion: 1, id: 'original', brandId: b, locationId: l, revision: 1, enabled: true, deletedAt: null,
      targets: scope.printerIds.map(printerId => ({ printerId, printerRevision: 1, kinds: ['kitchen'] })) }],
    [`locations/${l}/printerRouting/original`, { schemaVersion: 1, id: 'original', brandId: b, locationId: l, revision: 1, deletedAt: null,
      rules: scope.printerIds.map((printerId, i) => ({ id: prefix + 'rule-' + i, brandId: b, locationId: l, printerId, match: { type: 'category', id: category }, effect: 'include' })) }],
  ]);
  for (const printerId of scope.printerIds) {
    const p = `locations/${l}/printers/${printerId}`;
    rows.set(p, { schemaVersion: 1, configuration: { id: printerId, brandId: b, locationId: l, name: printerId, manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', paperWidthMm: 80, state: 'paused' }, revision: 1, deletedAt: null });
    rows.set(p + '/queue/state', { schemaVersion: 1, brandId: b, locationId: l, printerId, revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: 1 });
  }
  return rows;
}
async function createFixture(db) {
  assertRuntime();
  if (!(db instanceof Firestore) || db.projectId !== 'demo-orderfly-qa0' || db._settings.servicePath !== '127.0.0.1' || db._settings.port !== 8088 || db._settings.ssl !== false) throw Error('QA511 native database rejected');
  const rows = fixtureRows(), registered = new Set(rows.keys()), recursive = new Set(['orders/' + scope.orderId, 'locations/' + scope.locationId]);
  const hash = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const ownerPath = 'localQaFixtures/' + prefix + 'owner', owner = randomUUID();
  rows.set(ownerPath, { owner }); registered.add(ownerPath);
  const financial = [
    `invoiceCounters/${scope.brandId}-${new Date().getUTCFullYear()}`,
    'checkout_customer_capacity/' + hash([scope.brandId, prefix + 'customer']),
    'orderNotificationJobs/' + hash(['order-confirmation', scope.brandId, scope.orderId]),
  ];
  financial.forEach(p => registered.add(p));
  // All roots are vacant before acquiring ownership. A collision is never cleaned.
  for (const p of registered) assert.equal((await db.doc(p).get()).exists, false, 'QA511 fixture collision');
  for (const p of recursive) assert.equal((await db.doc(p).listCollections()).length, 0, 'QA511 recursive fixture collision');
  let owned = false;
  const registry = Object.freeze({ has: (p, descendants) => descendants ? recursive.has(p) || scope.printerIds.some(id => p === `locations/${scope.locationId}/printers/${id}`) : registered.has(p),
    register({ documents, recursiveRoots }) {
      assertRuntime(); assert.deepEqual(recursiveRoots, []);
      const orderRoot = 'orders/' + scope.orderId + '/printIntents/original';
      for (const p of documents) {
        if (p !== orderRoot && !scope.printerIds.some(id => new RegExp(`^locations/${scope.locationId}/printers/${id}/jobs/[a-f0-9]{64}$`).test(p))) throw Error('QA511 unowned registration');
        registered.add(p);
      }
    } });
  const cleanup = async () => {
    assertRuntime();
    // The create-only marker shares the seed batch. A failed/raced batch never
    // grants ownership of somebody else's colliding documents.
    if ((await db.doc(ownerPath).get()).data()?.owner !== owner) {
      if (owned) throw Error('QA511 cleanup ownership lost');
      return;
    }
    for (const p of recursive) await db.recursiveDelete(db.doc(p));
    for (const p of registered) if (p !== ownerPath && ![...recursive].some(root => p === root || p.startsWith(root + '/'))) await db.doc(p).delete();
    await db.doc(ownerPath).delete();
    for (const p of registered) assert.equal((await db.doc(p).get()).exists, false, 'QA511 native cleanup failed');
    for (const p of recursive) assert.equal((await db.doc(p).listCollections()).length, 0, 'QA511 descendants remain');
    owned = false;
  };
  try { const batch = db.batch(); for (const [p, data] of rows) batch.create(db.doc(p), data); await batch.commit(); owned = true; }
  catch { await cleanup(); throw Error('QA511 seed failed'); }
  return Object.freeze({ scope, registry, session, cleanup });
}
module.exports = { assertRuntime, startProvider, createFixture, fixtureRows };
