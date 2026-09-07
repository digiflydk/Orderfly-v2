const { loadTs } = require('./load-ts.cjs');
const { restoreCartItems } = loadTs('src/lib/cart-restore.ts');
const { cartChoices, CART_STORAGE_KEY } = loadTs('src/lib/cart-snapshot.ts');
const scope = { brandId: 'b', locationId: 'l', deliveryType: 'pickup', now: new Date('2026-09-07T14:00:00Z') };
const product = { id: 'pizza', brandId: 'b', locationIds: ['l'], isActive: true, productName: 'Italiana', price: 75, priceDelivery: 80, categoryId: 'pizza', toppingGroupIds: ['g'] };
const combo = { id: 'combo', brandId: 'b', locationIds: ['l'], isActive: true, comboName: 'Pizza combo', pickupPrice: 100, deliveryPrice: 110, orderTypes: ['pickup', 'delivery'], activeDays: [], activeTimeSlots: [], productGroups: [{ id: 'pg', groupName: 'Pizza', productIds: ['pizza'], minSelection: 1, maxSelection: 1 }] };
const choice = { id: 'pizza', cartItemId: 'line', itemType: 'product', quantity: 2, toppings: [], offered: false };
const comboChoice = { ...choice, id: 'combo', cartItemId: 'combo-line', itemType: 'combo', quantity: 1, comboSelections: [{ groupName: 'Pizza', products: [{ id: 'pizza' }] }] };
const catalog = () => ({
  products: [structuredClone(product)], combos: [structuredClone(combo)], discounts: [], upsells: [],
  toppings: [{ id: 't', toppingName: 'Cheese', price: 10, isActive: true, groupId: 'g', locationIds: ['l'] }],
  groups: [{ id: 'g', groupName: 'Extras', locationIds: ['l'], minSelection: 0, maxSelection: 2 }],
});
const discount = { id: 'd', brandId: 'b', locationIds: ['l'], orderTypes: ['pickup', 'delivery'], isActive: true, activeDays: [], activeTimeSlots: [], discountName: 'Pizza deal', discountType: 'product', discountMethod: 'percentage', discountValue: 20, referenceIds: ['pizza'] };
module.exports = { restoreCartItems, cartChoices, CART_STORAGE_KEY, scope, product, combo, choice, comboChoice, catalog, discount };
