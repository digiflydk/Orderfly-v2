const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { storefrontCheckoutMethods } = loadTs('src/lib/merchant-payment-methods.ts');
test('V2 uses configured hosted payment only; V1 retains pickup payment', () => {
  const both = { paymentMethods: { online: true, payAtPickup: true } };
  assert.deepEqual(storefrontCheckoutMethods(both, 'pickup', true), ['online']);
  assert.deepEqual(storefrontCheckoutMethods(both, 'delivery', true), ['online']);
  assert.deepEqual(storefrontCheckoutMethods(both, 'pickup', false), ['online', 'pay_at_pickup']);
});
test('V2 never falls back to pickup payment or enables disabled online payment', () => {
  const disabled = { paymentMethods: { online: false, payAtPickup: true } };
  assert.deepEqual(storefrontCheckoutMethods(disabled, 'pickup', true), []);
  assert.deepEqual(storefrontCheckoutMethods(disabled, 'delivery', true), []);
  assert.deepEqual(storefrontCheckoutMethods({}, 'pickup', true), ['online']);
});
