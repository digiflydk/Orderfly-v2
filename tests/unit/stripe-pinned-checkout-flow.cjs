const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');

async function fixture(ownLocation) {
  const secrets = new Map(), usedKeys = [], secretReads = [];
  let settingsPath, originalReference, originalKey;
  class SecretManager {
    async accessSecretVersion({ name }) {
      secretReads.push(name);
      if (!secrets.has(name)) throw Error('Fixture secret unavailable');
      return [{ payload: { data: Buffer.from(JSON.stringify(secrets.get(name))) } }];
    }
  }
  const f = await paymentFixture({ customerOverrides: { paymentMethod: 'online' }, configureMocks: ({ mocks, records, marketingDb }) => {
    const load = moduleGraph({ 'server-only': {},
      '@/lib/firebase-admin': { getAdminDb: () => marketingDb, getAdminApp: () => ({ options: { projectId: 'orderfly-39325' } }) },
      '@google-cloud/secret-manager': { SecretManagerServiceClient: SecretManager },
    });
    const store = load('src/lib/payments/worldline-store.ts');
    const brandScope = { brandId: 'b' }, owner = ownLocation ? { brandId: 'b', locationId: 'l' } : brandScope;
    const brandHash = store.worldlineSettingsId(brandScope), hash = store.worldlineSettingsId(owner);
    settingsPath = `platform_settings/worldline-${hash}`;
    originalReference = `projects/orderfly-39325/secrets/orderfly-stripe-${hash}-test/versions/1`;
    originalKey = ownLocation ? 'sk_test_originalLocation' : 'sk_test_originalBrand';
    secrets.set(originalReference, { secretKey: originalKey, publishableKey: 'pk_test_original', webhookSecret: 'whsec_original' });
    records.set(`platform_settings/worldline-${brandHash}`, { source: 'own', provider: 'stripe', mode: 'test', revision: 1,
      stripeTest: ownLocation ? `projects/orderfly-39325/secrets/orderfly-stripe-${brandHash}-test/versions/9` : originalReference });
    records.set(`platform_settings/worldline-${store.worldlineSettingsId({ brandId: 'b', locationId: 'l' })}`,
      ownLocation ? { source: 'own', provider: 'stripe', mode: 'test', revision: 1, stripeTest: originalReference }
        : { source: 'brand', provider: 'stripe', mode: 'test', revision: 1 });
    mocks['@/lib/payments/merchant-agreement'] = load('src/lib/payments/merchant-agreement.ts');
    const Original = mocks.stripe.default;
    mocks.stripe = { default: class extends Original {
      constructor(...args) {
        super(...args); usedKeys.push(args[0]);
        const create = this.checkout.sessions.create;
        this.checkout.sessions.create = async (...input) => ({ ...await create(...input), id: 'cs_test_original_checkout_reference' });
      }
    } };
  } });
  assert.equal(f.result.success, true, f.result.error);
  const initialOrder = structuredClone(f.order());
  assert.equal(initialOrder.paymentAgreement.reference, originalReference);
  assert.equal(initialOrder.paymentAgreement.owner.locationId, ownLocation ? 'l' : undefined);
  assert.equal(initialOrder.paymentStatus, 'Pending');
  const newReference = originalReference.replace('/versions/1', '/versions/2');
  secrets.set(newReference, { secretKey: 'sk_test_rotated', publishableKey: 'pk_test_rotated', webhookSecret: 'whsec_rotated' });
  f.records.set(settingsPath, { source: 'own', provider: 'stripe', mode: 'test', revision: 2, stripeTest: newReference });
  f.records.set('platform_settings/payment_gateway', { activeMode: 'live', live: { secretKey: 'sk_live_global' } });
  const Transport = f.mocks.stripe.default;
  let globalReads = 0;
  const load = moduleGraph({ ...f.mocks, react: require('next/dist/compiled/react'),
    stripe: { default: class extends Transport { constructor(key) { super(key); usedKeys.push(key); } } },
    '@google-cloud/secret-manager': { SecretManagerServiceClient: SecretManager },
    '@/lib/firebase-admin': { ...f.mocks['@/lib/firebase-admin'], getAdminApp: () => ({ options: { projectId: 'orderfly-39325' } }) },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => { globalReads++; return 'sk_live_global'; } },
    '@/app/checkout/order-actions': { getOrderById: async id => {
      const row = f.records.get('orders/' + id); return row ? { ...structuredClone(row), id } : null;
    } },
    'next/server': { after: () => {}, NextResponse: { json: (body, init) => Response.json(body, init) } },
    'next/headers': { cookies: async () => ({ get: () => undefined }) },
  });
  const route = load('src/app/api/payments/confirm-from-session/route.ts');
  const receipts = load('src/lib/server/guest-receipt.ts');
  const token = new URL(f.sessionParams.success_url).searchParams.get('receipt_token');
  const proof = { orderId: f.orderId, sessionId: initialOrder.psp.checkoutSessionId, receiptToken: token, brandId: 'b', locationId: 'l' };
  return { ...f, usedKeys, secretReads, originalReference, originalKey, initialOrder, proof,
    globalReads: () => globalReads,
    confirm: () => route.POST(new Request('https://fixture.test/api/payments/confirm-from-session', { method: 'POST', body: JSON.stringify({ orderId: f.orderId, sessionId: proof.sessionId }) })),
    receipt: () => receipts.readGuestReceipt(proof),
  };
}

for (const ownLocation of [false, true]) test(`${ownLocation ? 'own location' : 'inherited brand'} Stripe checkout settles and reads its original account after settings rotate`, async () => {
  const f = await fixture(ownLocation);
  assert.equal((await f.confirm()).status, 200);
  assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().status, 'Received');
  const invoice = f.order().invoice.number, customerId = f.order().customerDetails.id;
  assert.ok(invoice); assert.equal(f.records.get('customers/' + customerId).totalOrders, 1);
  const receipt = await f.receipt(); assert.equal(receipt.paymentStatus, 'Paid'); assert.equal(receipt.invoice.number, invoice);
  assert.equal((await f.confirm()).status, 200);
  assert.equal((await f.receipt()).invoice.number, invoice);
  assert.equal(f.records.get('customers/' + customerId).totalOrders, 1);
  assert.equal(f.order().paymentAgreement.reference, f.originalReference);
  assert.equal(f.globalReads(), 0); assert.ok(f.usedKeys.length > 1);
  assert.ok(f.usedKeys.every(key => key === f.originalKey));
  assert.ok(f.secretReads.every(reference => reference === f.originalReference));
  assert.doesNotMatch(JSON.stringify(receipt), /sk_test|whsec|paymentAgreement|receiptTokenHash/);
});
