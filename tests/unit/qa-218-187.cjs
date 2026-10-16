const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const { standardDiscountValueLabel } = loadTs('src/lib/automatic-discounts.ts');
const { cartSnapshotSchema, restorableSelectedTime } = loadTs('src/lib/cart-snapshot.ts');

test('#218 a rule switched from a fixed cart amount to free delivery is listed as Free Delivery', () => {
  // QA record Cgj04T9BJXrl5gMpb6vV kept its historical 20 kr. fixed amount after the type switch.
  assert.equal(standardDiscountValueLabel({ discountType: 'free_delivery', discountMethod: 'fixed_amount', discountValue: 20 }), 'Free Delivery');
  assert.equal(standardDiscountValueLabel({ discountType: 'cart', discountMethod: 'fixed_amount', discountValue: 20 }), 'kr. 20.00');
  assert.equal(standardDiscountValueLabel({ discountType: 'product', discountMethod: 'percentage', discountValue: 5 }), '5%');
});

const now = Date.parse('2026-10-07T08:00:00Z');
const base = { version: 1, brandId: 'b', locationId: 'l', deliveryType: 'pickup', includeBagFee: true, choices: [], savedAt: now };

test('#187 a saved future pickup slot survives a full reload for the same order type', () => {
  const snapshot = cartSnapshotSchema.parse({ ...base, selectedTime: '2026-10-07T09:15:00.000Z' });
  assert.equal(restorableSelectedTime(snapshot, 'pickup', now), '2026-10-07T09:15:00.000Z');
});

test('#187 past slots, another order type and malformed values are not restored', () => {
  assert.equal(restorableSelectedTime({ deliveryType: 'pickup', selectedTime: '2026-10-07T07:45:00.000Z' }, 'pickup', now), null);
  assert.equal(restorableSelectedTime({ deliveryType: 'pickup', selectedTime: '2026-10-07T09:15:00.000Z' }, 'delivery', now), null);
  assert.equal(restorableSelectedTime({ deliveryType: 'pickup' }, 'pickup', now), null);
  assert.equal(cartSnapshotSchema.safeParse({ ...base, selectedTime: 'tomorrow' }).success, false);
  // Older snapshots without the field remain valid.
  assert.equal(cartSnapshotSchema.safeParse(base).success, true);
});
