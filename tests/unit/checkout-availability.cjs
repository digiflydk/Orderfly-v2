const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const { calculateTimeSlots } = load('src/app/superadmin/locations/client-actions.ts');
const location = {
  deliveryTypes: ['pickup', 'delivery'], allowPreOrder: true, prep_time: 20, delivery_time: 20,
  openingHours: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isOpen: true, open: '12:00', close: '22:00' }])),
};
test('after closing defaults to next opening plus 20 / 40 minutes, not old slots', () => {
  const slots = calculateTimeSlots(location, undefined, new Date('2026-09-06T21:00:00Z'));
  assert.equal(slots.asap_pickup, 'Tomorrow - 12:20');
  assert.equal(slots.asap_delivery, 'Tomorrow - 12:40');
  assert.deepEqual(slots.pickup_times, []);
  assert.deepEqual(slots.delivery_times, []);
});
test('closed next day is skipped and not labelled tomorrow; preorder policy respected', () => {
  const closed = structuredClone(location); closed.openingHours.monday.isOpen = false;
  const now = new Date('2026-09-06T21:00:00Z');
  assert.equal(calculateTimeSlots(closed, undefined, now).asap_pickup, 'Tue, Sep 8 - 12:20');
  assert.equal(calculateTimeSlots({...closed, allowPreOrder:false}, undefined, now).asap_pickup, '');
});
test('before and exactly at opening, winter Copenhagen and explicit date', () => {
  assert.equal(calculateTimeSlots(location, undefined, new Date('2026-01-05T10:00:00Z')).asap_delivery, 'Today - 12:40');
  assert.equal(calculateTimeSlots(location, undefined, new Date('2026-01-05T11:00:00Z')).asap_pickup, 'ASAP (20-25 min)');
  const slots = calculateTimeSlots(location, '2026-09-06T12:00:00Z', new Date('2026-09-06T21:00:00Z'));
  assert.equal(slots.asap_pickup, '');
});
test('delivery rolls to tomorrow independently of remaining pickup capacity', () => {
  const slots = calculateTimeSlots(location, undefined, new Date('2026-09-06T19:10:00Z'));
  assert.equal(slots.asap_pickup, 'ASAP (20-25 min)');
  assert.equal(slots.asap_delivery, 'Tomorrow - 12:40');
});
test('newsletter offer checks actual customer and keeps canceled retry eligible', async () => {
  let customer = { totalOrders: 1, marketingConsent: false };
  let discount = { brandId:'b', applicationType:'newsletter_signup', isActive:true, locationIds:['l'], orderTypes:['pickup'], activeDays:[], activeTimeSlots:[], usedCount:0, usageLimit:0, perCustomerLimit:1 };
  const imports = [...fs.readFileSync('src/app/checkout/actions.ts','utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const mocks = Object.fromEntries(imports.map(name=>[name,{}]));
  mocks['@/lib/promotion-rules'] = load('src/lib/promotion-rules.ts');
  mocks['@/lib/checkout-customer-identity'] = {findCheckoutCustomer:async()=>({ref:{id:'c'},exists:()=>true,data:()=>customer})};
  mocks['firebase/firestore'] = {collection:()=>null,where:()=>null,query:()=>null,getDocs:async()=>({docs:[{id:'d',data:()=>discount}]})};
  const api = load('src/app/checkout/actions.ts',mocks);
  const offer = () => api.getNewsletterSignupDiscountAction('b','l',100,'pickup','a@example.com');
  assert.equal((await offer()).id,'d'); // Returning customer may newly subscribe.
  discount.firstTimeCustomerOnly = true;
  assert.equal(await offer(),null);
  discount.firstTimeCustomerOnly = false;
  customer.marketingConsent = true;
  assert.equal(await offer(),null);
  customer.pendingNewsletterDiscountId = 'd';
  assert.equal((await offer()).id,'d');
  customer.discountUsage = {d:1};
  assert.equal(await offer(),null);
});
