const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const { promotionEligibilityIssues } = loadTs('src/lib/promotion-eligibility.ts');
const { basketTotals } = loadTs('src/lib/basket-totals.ts');

const now = new Date('2026-09-29T08:00:00Z');
const locations = [{ id: 'amager', brandId: 'esmeralda' }, { id: 'other-brand-loc', brandId: 'other' }];

test('#206 an Active rule scoped only to a deleted location is flagged as not currently valid', () => {
  // Newsletter signup / Pizza Pizza from QA: only the deleted location is selected.
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['AkGaLAwyJfJ1KR12Dd79'],
    startDate: '2026-09-06T00:00:00Z', endDate: '2026-09-30T21:59:59Z' }, locations, now), ['no_current_location']);
  // SUMMER20: deleted location and expired.
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['AkGaLAwyJfJ1KR12Dd79'],
    startDate: '2025-10-19T00:00:00Z', endDate: { _seconds: Date.parse('2026-09-09T21:59:59Z') / 1000, _nanoseconds: 0 } }, locations, now), ['no_current_location', 'expired']);
  // Another brand's location never makes a rule valid for this brand.
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['other-brand-loc'] }, locations, now), ['no_current_location']);
});

test('#206 rules with a current location, all locations or future dates are reported precisely', () => {
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['AkGaLAwyJfJ1KR12Dd79', 'amager'] }, locations, now), []);
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: [] }, locations, now), []);
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['amager'], startDate: new Date('2026-10-24T00:00:00Z') }, locations, now), ['not_started']);
  assert.deepEqual(promotionEligibilityIssues({ brandId: 'esmeralda', locationIds: ['amager'], endDate: 'not a date' }, locations, now), []);
});

// #219 QA tables: Pizza Combo 95 + Pepperoni upgrade 10 + Dressing 10 = 115.
const combo = { id: 'combo', cartItemId: 'c', itemType: 'combo', productName: 'Pizza Combo', basePrice: 115, price: 115, quantity: 1, toppings: [] };
const pepsi = { id: 'pepsi', cartItemId: 'p', itemType: 'product', basePrice: 20, price: 20, quantity: 1, toppings: [] };
const pepsiOffer = { ...pepsi, cartItemId: 'po', price: 15 };
const faxe = { id: 'faxe', cartItemId: 'f', itemType: 'product', basePrice: 40, price: 40, quantity: 1, toppings: [] };
const newsletter = allowStacking => ({ id: 'n', code: 'Nyhedsbrev', applicationType: 'newsletter_signup', discountType: 'percentage', discountValue: 10, minOrderValue: 0, allowStacking });
const totals = (cartItems, allowStacking) => basketTotals({ cartItems, appliedDiscount: newsletter(allowStacking), standardDiscounts: [],
  deliveryType: 'pickup', location: null, brand: { bagFee: 4 }, includeBagFee: true });

test('#219 without stacking the newsletter discount excludes combos, upgrades and discounted items', () => {
  for (const [cart, discount, total] of [[[combo], 0, 119], [[combo, pepsi], 2, 137], [[combo, pepsiOffer, faxe], 4, 170]]) {
    const result = totals(cart, false);
    assert.equal(result.voucherDiscount?.amount || 0, discount, cart.map(i => i.cartItemId).join('+'));
    assert.equal(result.checkoutTotal, total);
  }
});

test('#219 with stacking the newsletter discount includes combos after item offers, never fees', () => {
  assert.equal(totals([combo], true).voucherDiscount.amount, 11.5);
  assert.equal(totals([combo], true).checkoutTotal, 107.5);
  assert.equal(totals([combo, pepsiOffer, faxe], true).voucherDiscount.amount, 17);
  assert.equal(totals([combo, pepsiOffer, faxe], true).checkoutTotal, 157);
});
