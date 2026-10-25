const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { projectKitchenReceipt, SAMPLE_KITCHEN_RECEIPT } = loadTs('src/lib/receipts/kitchen-preview.ts');
const order = () => ({
  id: 'ORDER-123', brandId: 'brand-a', locationId: 'location-a', brandName: 'Brand', locationName: 'Location',
  status: 'Received', deliveryType: 'Pickup', fulfillmentAt: '2026-10-23T16:30:00Z', deliveryTime: 'Legacy time',
  customerName: 'Example', customerContact: 'private-email@example.com',
  customerDetails: { id: 'private-customer-id', address: 'private-address', deliveryInstructions: 'Pak separat' },
  paymentDetails: { subtotal: 240, paymentRefId: 'private-payment' }, totalAmount: 240,
  psp: { paymentIntentId: 'private-psp' }, analytics: { sessionId: 'private-session', attribution: { source: 'Not an order channel' } },
  invoice: { lines: [{ description: 'Wrong fiscal-only item', quantity: 99 }] },
  productItems: [{ id: 'pizza', name: 'Pizza', quantity: 1, unitPrice: 80, totalPrice: 80, toppings: ['Uden løg', 'Ekstra ost'] },
    { id: 'combo', name: '3 for 2', quantity: 2, itemType: 'combo', unitPrice: 219, totalPrice: 438,
      comboSelections: [{ groupName: 'Pizzaer', products: [{ id: 'a', name: 'Italiana' }, { id: 'b', name: 'Pepperoni' }, { id: 'b', name: 'Pepperoni' }] }] }],
});

test('kitchen uses recorded items and excludes fiscal/payment, tracking and non-kitchen customer data', () => {
  const result = projectKitchenReceipt(order());
  assert.equal(result.reference, 'ORDER-123');
  assert.equal(result.lines[0].name, 'Pizza');
  assert.deepEqual(result.lines[0].modifiers, ['Uden løg', 'Ekstra ost']);
  assert.equal(result.notes, 'Pak separat');
  assert.equal(result.customerPhone, '');
  assert.equal(result.fulfillmentType, 'Afhentning');
  assert.equal(result.fulfillmentAt, '2026-10-23T16:30:00.000Z');
  assert.equal(result.lines[0].category, 'Varer');
  assert.equal(result.lines[1].category, 'Menuer');
  const serialized = JSON.stringify(result);
  for (const denied of ['private-', 'Wrong fiscal', 'Not an order channel', 'subtotal', 'unitPrice', 'totalPrice', 'totalAmount']) assert.ok(!serialized.includes(denied), denied);
});

test('menu quantities multiply repeated choices by parent quantity, without collapsing distinct rows', () => {
  const input = order();
  input.productItems.push({ id: 'pizza', name: 'Pizza', quantity: 1, toppings: ['Uden ost'] });
  const result = projectKitchenReceipt(input);
  assert.deepEqual(result.lines[1].groups[0], { name: 'Pizzaer', products: [{ name: 'Italiana', quantity: 2 }, { name: 'Pepperoni', quantity: 4 }] });
  assert.equal(result.lines.length, 3);
  assert.deepEqual(result.lines[2].modifiers, ['Uden ost']);
  input.productItems[1].comboSelections[0].products.push({ id: 'different', name: 'Pepperoni' });
  assert.equal(projectKitchenReceipt(input).lines[1].groups[0].products.length, 3);
});

test('uses only provided own category mappings and never guesses from item name or object prototype', () => {
  const input = order();
  const categories = Object.assign(Object.create({ pizza: 'Inherited category' }), { combo: 'Kampagner' });
  assert.equal(projectKitchenReceipt(input, categories).lines[0].category, 'Varer');
  assert.equal(projectKitchenReceipt(input, categories).lines[1].category, 'Kampagner');
  assert.equal(projectKitchenReceipt(input, { pizza: 'Pizza' }).lines[0].category, 'Pizza');
  assert.equal(projectKitchenReceipt(input, { pizza: ' ' }).lines[0].category, 'Varer');
});

test('fulfillment date accepts native Firestore value, missing values remain unknown and cancellation remains explicit', () => {
  const input = order();
  input.fulfillmentAt = { toDate: () => new Date('2026-10-23T16:30:00Z') };
  assert.equal(projectKitchenReceipt(input).fulfillmentAt, '2026-10-23T16:30:00.000Z');
  input.fulfillmentAt = new Date('invalid'); input.deliveryTime = ''; input.status = 'Canceled'; input.deliveryType = 'Delivery';
  const result = projectKitchenReceipt(input);
  assert.equal(result.fulfillmentAt, undefined); assert.equal(result.fulfillmentLabel, '');
  assert.equal(result.status, 'Annulleret'); assert.equal(result.canceled, true); assert.equal(result.fulfillmentType, 'Levering');
  input.fulfillmentAt = { toDate() { throw Error('invalid'); } };
  assert.equal(projectKitchenReceipt(input).fulfillmentAt, undefined);
});

test('invalid quantities are visibly unknown instead of inventing or silently omitting items', () => {
  const input = order(); input.productItems[0].quantity = -1; input.productItems[1].quantity = NaN;
  const result = projectKitchenReceipt(input);
  assert.equal(result.lines[0].quantity, null); assert.equal(result.lines[1].quantity, null);
  assert.equal(result.lines[1].groups[0].products[0].quantity, null);
  assert.equal(result.lines[1].groups[0].products[1].quantity, null);
});

function loadComponent(filename = 'src/components/receipts/kitchen-receipt-preview.tsx') {
  const fs = require('node:fs'), ts = require('typescript');
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/lib/receipts/kitchen-preview') return { SAMPLE_KITCHEN_RECEIPT };
    if (name === '@/lib/receipts/print-layout') return loadTs('src/lib/receipts/print-layout.ts');
    if (name === '@/lib/receipts/preview') return loadTs('src/lib/receipts/preview.ts');
    if (name === './receipt-svg-preview') return loadComponent('src/components/receipts/receipt-svg-preview.tsx');
    return require(name);
  }, module, module.exports);
  return filename.endsWith('kitchen-receipt-preview.tsx') ? module.exports.KitchenReceiptPreview : module.exports;
}
const KitchenReceiptPreview = loadComponent();
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const defaults = { paperWidthMm: 80, heading: 'Køkkenbon', textSize: 'large', groupByCategory: true, showBrandName: true, showLocationName: true, showCustomer: true, showPhone: false };

test('renderer preserves kitchen-critical notes/modifiers, escapes text, hides prices and shows cancellation', () => {
  const input = projectKitchenReceipt(order()); input.canceled = true; input.notes = '<script>do-not-run</script>';
  const html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: { ...defaults, paperWidthMm: 58, showCustomer: false }, order: input }));
  assert.match(html, /ANNULLERET/); assert.match(html, /MÅ IKKE TILBEREDES/);
  assert.match(html, /Uden løg/); assert.match(html, /Ekstra ost/); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-paper-width="58"/); assert.match(html, /width:58mm/);
  assert.match(html, /Menuindhold i alt/); assert.match(html, /4 × Pepperoni/);
  assert.match(html, /18[.:]30/);
  assert.doesNotMatch(html, /Kunde:|private-|DKK|Subtotal|I alt|<script>/);
});

test('categories can be disabled without losing any item and empty time/items are explicit', () => {
  const input = structuredClone(SAMPLE_KITCHEN_RECEIPT);
  let html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: { ...defaults, groupByCategory: false }, order: input }));
  assert.doesNotMatch(html, />Burgere<|>Pizza</); assert.match(html, />Varer</);
  assert.match(html, /Kyllingburger/); assert.match(html, /Italiana/); assert.match(html, /Pak de to menuer/);
  input.fulfillmentAt = undefined; input.fulfillmentLabel = ''; input.lines = [];
  html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: defaults, order: input }));
  assert.match(html, /Tidspunkt ikke angivet/); assert.match(html, /Ingen varer registreret/);
});


test('phone projection accepts only a valid saved customerDetails.phone, with no contact/profile fallback', () => {
  const input = order();
  input.customerDetails.phone = '+45 12 34 56 78';
  assert.equal(projectKitchenReceipt(input).customerPhone, '+45 12 34 56 78');
  for (const phone of [undefined, null, 12345678, '', '1234', '9'.repeat(51), '+451234\n5678', '+451234\u202e5678']) {
    input.customerDetails.phone = phone;
    assert.equal(projectKitchenReceipt(input).customerPhone, '');
  }
  delete input.customerDetails.phone;
  input.customerContact = '+45 87 65 43 21';
  input.customerPhone = '+45 98 76 54 32';
  assert.equal(projectKitchenReceipt(input).customerPhone, '');
});

test('saved phone respects its independent visibility setting and missing phone never renders a label', () => {
  const input = order(); input.customerDetails.phone = '+45 12 34 56 78';
  const projected = projectKitchenReceipt(input);
  let html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: { ...defaults, showPhone: true, showCustomer: false }, order: projected }));
  assert.match(html, /Telefon: \+45 12 34 56 78/);
  assert.doesNotMatch(html, /Kunde:/);
  html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: { ...defaults, showPhone: false }, order: projected }));
  assert.doesNotMatch(html, /Telefon:|12 34 56 78/);
  projected.customerPhone = '';
  html = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: { ...defaults, showPhone: true }, order: projected }));
  assert.doesNotMatch(html, /Telefon:/);
});


test('oversized kitchen and customer previews show explicit alerts instead of throwing or rendering partial receipts', () => {
  const tooLongKitchen = { ...SAMPLE_KITCHEN_RECEIPT, lines: Array(100).fill(SAMPLE_KITCHEN_RECEIPT.lines[0]) };
  const kitchen = renderToStaticMarkup(React.createElement(KitchenReceiptPreview, { settings: defaults, order: tooLongKitchen }));
  assert.match(kitchen, /role="alert"/); assert.match(kitchen, /Bonnen kan ikke vises/); assert.doesNotMatch(kitchen, /<svg/);
  const { ReceiptPreview } = loadComponent('src/components/receipts/receipt-preview.tsx');
  const { SAMPLE_RECEIPT } = loadTs('src/lib/receipts/preview.ts');
  const { DEFAULT_RECEIPT_SETTINGS } = loadTs('src/lib/receipts/settings.ts');
  const customer = renderToStaticMarkup(React.createElement(ReceiptPreview, { settings: DEFAULT_RECEIPT_SETTINGS, order: { ...SAMPLE_RECEIPT, lines: Array(100).fill(SAMPLE_RECEIPT.lines[0]) } }));
  assert.match(customer, /role="alert"/); assert.match(customer, /Bonnen kan ikke vises/); assert.doesNotMatch(customer, /<svg/);
});
