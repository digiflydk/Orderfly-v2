const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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

test('transaction-time identity reservation conflict uses the same public message', async () => {
  const emailHash = createHash('sha256').update('b\ntest@example.test', 'utf8').digest('hex');
  const { result, events } = await checkout({
    beforeCustomerTransaction(records) {
      records.set(`integrationConsumerCustomerIdentities/${emailHash}`, {
        brandId: 'b',
        customerId: 'concurrent-customer',
      });
    },
  });
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.error, publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE);
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

test('delivery quote identity errors are actionable and stop before provider or payment', async () => {
  for (const fault of ['identity-conflict', 'identity-unknown']) {
    let providerCalls=0;
    const f=await checkout({fault,createOnly:true,configureMocks:({mocks})=>{
      mocks['@/lib/delivery/quotes/runtime'].managedDeliveryRuntimeAvailable=async()=>true;
      mocks['@/lib/delivery/quotes/customer-controller']={createNativeManagedCustomerQuote:async()=>{providerCalls++;throw Error('must not reach provider');}};
    }});
    const result=await f.actions.requestManagedDeliveryQuoteAction({checkoutKey:'a'.repeat(64),cartItems:[{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100}],customerInfo:{name:'Test',email:'test@example.test',phone:'12345678',street:'Test 1',zipCode:'1300',city:'Copenhagen',subscribeToNewsletter:false,acceptTerms:false},brandId:'b',locationId:'l',paymentDetails:{subtotal:100,deliveryFee:0,discountTotal:0,tips:0,taxes:0},appliedDiscountId:null,brandSlug:'brand',locationSlug:'location',deliveryTime:'asap'});
    assert.equal(result.ok,false);
    assert.equal(result.code,fault==='identity-conflict'?'customer_identity_conflict':'delivery_unavailable');
    if(fault==='identity-conflict')assert.equal(result.message,publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE);
    assert.doesNotMatch(result.message,/PRIVATE|scope conflict/i);
    assert.equal(providerCalls,0);assert.equal(f.events.includes('stripe'),false);assert.equal(f.writes.length,0);
  }
});
test('all identity safeguards have one quote and diagnostic classification',()=>{
  const {customerQuoteFailure}=loadTs('src/lib/delivery/quotes/customer-failure.ts');
  const {quoteDiagnosticCode}=loadTs('src/lib/delivery/quotes/diagnostic-schema.ts');
  for(const message of ['Customer identity scope conflict.','Customer email and phone point to different profiles.','Customer email identity scope conflict.','Customer phone identity scope conflict.','ambiguous_email_identity','ambiguous_phone_identity','customer_identity_conflict']){
    assert.equal(customerQuoteFailure(new Error(message)).message,publicError.CUSTOMER_IDENTITY_CHECKOUT_MESSAGE);
    assert.equal(quoteDiagnosticCode(new Error(message)),'customer_identity_conflict');
  }
});
