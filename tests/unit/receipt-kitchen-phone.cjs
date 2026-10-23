const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { checkout } = require('../helpers/checkout-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');

for (const deliveryType of ['pickup', 'delivery']) test(`actual ${deliveryType} checkout snapshots the validated order phone without changing fiscal data`, async () => {
  const f = await checkout({ deliveryType, customerOverrides: { phone: '  +45 12 34 56 78  ', street: 'Testvej 1', zipCode: '2900', city: 'Test' } });
  assert.equal(f.result.success, true, f.result.error);
  const order = f.records.get('orders/ORD-TEST');
  assert.equal(order.customerDetails.phone, '+45 12 34 56 78');
  assert.equal(order.customerDetails.address, deliveryType === 'delivery' ? 'Testvej 1, 2900 Test' : 'For Pickup');
  assert.deepEqual(Object.keys(order.customerDetails).sort(), ['address', 'id', 'phone']);
  assert.equal(order.customerContact, 'test@example.test');
  assert.equal(order.productItems[0].name, 'Pizza');
  assert.equal(order.productItems[0].totalPrice, 100);
  // Updating the separate contact profile must not rewrite this order's snapshot.
  const customer = f.records.get('customers/' + order.customerDetails.id);
  assert.ok(customer);
  customer.phone = '99999999';
  assert.equal(f.records.get('orders/ORD-TEST').customerDetails.phone, '+45 12 34 56 78');
});

for (const phone of ['', '1234', '1'.repeat(51), { number: '12345678' }]) test(`invalid checkout phone ${JSON.stringify(phone)} cannot create a snapshot`, async () => {
  const f = await checkout({ customerOverrides: { phone } });
  assert.equal(f.result.success, false);
  assert.equal(f.writes.length, 0);
  assert.equal(f.records.has('orders/ORD-TEST'), false);
});

test('guest receipt retains its original explicit allowlist and never exposes the new phone snapshot', async () => {
  const f = await checkout({ customerOverrides: { phone: '+45 12 34 56 78' } });
  assert.equal(f.result.success, true, f.result.error);
  const token = 'a'.repeat(64), order = { ...f.records.get('orders/ORD-TEST'), receiptTokenHash: createHash('sha256').update(token).digest('hex') };
  const { readGuestReceipt } = loadTs('src/lib/server/guest-receipt.ts', {
    'server-only': {},
    '@/app/checkout/order-actions': { getOrderById: async () => order },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => null },
    './settle-checkout': { settlePaidCheckoutSession: async () => { throw Error('No settlement expected'); } },
  });
  const receipt = await readGuestReceipt({ orderId: order.id, sessionId: order.psp.checkoutSessionId, receiptToken: token, brandId: 'b', locationId: 'l' });
  assert.ok(receipt);
  assert.deepEqual(receipt.customerDetails, { id: order.customerDetails.id, address: order.customerDetails.address });
  assert.equal(JSON.stringify(receipt).includes('+45 12 34 56 78'), false);
});
