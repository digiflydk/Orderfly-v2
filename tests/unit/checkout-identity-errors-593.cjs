const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { checkout } = require('../helpers/checkout-fixture.cjs');

const publicError = loadTs('src/lib/checkout-public-error.ts');

test('all internal customer identity conflicts use one safe Danish message', () => {
  for (const message of [
    'Customer identity scope conflict.',
    'Customer email and phone point to different profiles.',
    'Customer email identity scope conflict.',
    'Customer phone identity scope conflict.',
    'ambiguous_email_identity',
    'ambiguous_phone_identity',
    'customer_identity_conflict',
  ]) {
    assert.equal(
      publicError.checkoutCustomerIdentityMessage(new Error(message)),
      publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE,
    );
  }
  assert.equal(publicError.checkoutCustomerIdentityMessage(new Error('PRIVATE_FAILURE')), null);
});

test('order checkout explains an identity conflict without exposing internal text', async () => {
  const { result, events } = await checkout({ fault: 'identity-conflict' });
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.error, publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE);
  assert.doesNotMatch(result.error, /scope conflict|different profiles/i);
  assert.equal(events.includes('stripe'), false);
});

test('discount validation explains an identity conflict and sanitizes unknown lookup failures', async () => {
  for (const [fault, expected] of [
    ['identity-conflict', publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE],
    ['identity-unknown', 'Kundeoplysningerne kunne ikke kontrolleres. Prøv igen.'],
  ]) {
    const { actions } = await checkout({ fault, createOnly: true });
    const result = await actions.validateDiscountAction(
      'SAVE10', 'b', 'l', 100, 'pickup', 'test@example.test', ['p'], 100,
    );
    assert.equal(result.success, false);
    assert.equal(result.message, expected);
    assert.doesNotMatch(result.message, /PRIVATE|scope conflict/i);
  }
});
