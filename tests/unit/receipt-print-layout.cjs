const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { renderKitchenReceiptSvg, renderCustomerReceiptSvg, RECEIPT_LAYOUT_LIMITS } = loadTs('src/lib/receipts/print-layout.ts');
const { SAMPLE_KITCHEN_RECEIPT } = loadTs('src/lib/receipts/kitchen-preview.ts');
const { SAMPLE_RECEIPT } = loadTs('src/lib/receipts/preview.ts');
const { DEFAULT_KITCHEN_SETTINGS } = loadTs('src/lib/receipts/kitchen-settings.ts');
const { DEFAULT_RECEIPT_SETTINGS } = loadTs('src/lib/receipts/settings.ts');

test('kitchen document preserves the approved sections, menu totals and all minimum physical font sizes at both widths', () => {
  for (const width of [58, 80]) {
    const result = renderKitchenReceiptSvg({ ...DEFAULT_KITCHEN_SETTINGS, paperWidthMm: width }, SAMPLE_KITCHEN_RECEIPT);
    assert.equal(result.width, width === 80 ? 576 : 384); assert.ok(result.height <= 8192);
    assert.deepEqual(result.categories, ['Pizza', 'Burgere']);
    assert.match(result.svg, /fill="#000"/); assert.match(result.svg, /fill="#fff"/);
    assert.ok(result.text.includes('2 × Kyllingburger')); assert.ok(result.text.includes('Uden løg'));
    assert.ok(result.text.includes('Pak de to menuer i hver sin pose.')); assert.ok(result.text.includes('#EKSEMPEL-1042'));
    assert.ok(result.svg.includes('stroke-width="3"'));
    const sizes = [...result.svg.matchAll(/font-size="(\d+)"/g)].map(match => Number(match[1]));
    assert.ok(sizes.length); assert.ok(Math.min(...sizes) >= RECEIPT_LAYOUT_LIMITS.minFontDots);
    assert.ok(Math.min(...sizes) / 203 * 72 >= 10);
  }
});

test('settings remove only optional details, never notes/modifiers, and cancellation is unmissable', () => {
  const order = { ...SAMPLE_KITCHEN_RECEIPT, canceled: true, customerPhone: '+45 12345678' };
  const result = renderKitchenReceiptSvg({ ...DEFAULT_KITCHEN_SETTINGS, showCustomer: false, showPhone: false, showBrandName: false, showLocationName: false, groupByCategory: false }, order);
  assert.deepEqual(result.categories, ['Varer']); assert.ok(result.text.includes('ANNULLERET')); assert.ok(result.text.includes('MÅ IKKE TILBEREDES'));
  assert.ok(result.text.includes('Uden løg')); assert.ok(!result.text.some(text => text.includes('12345678') || text.includes('Eksempelkunde') || text.includes('Eksempelrestaurant')));
});

test('XML escapes every text field, preserves Danish glyphs and bounds hostile/oversized documents', () => {
  const result = renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS, { ...SAMPLE_KITCHEN_RECEIPT, notes: '<script>ÆØÅ æøå & "test"</script>' });
  assert.match(result.svg, /&lt;script&gt;/); assert.doesNotMatch(result.svg, /<script>/); assert.match(result.svg, /ÆØÅ æøå/);
  assert.throws(() => renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS, { ...SAMPLE_KITCHEN_RECEIPT, notes: 'bad\u202etext' }), /receipt_layout_invalid/);
  assert.throws(() => renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS, { ...SAMPLE_KITCHEN_RECEIPT, notes: 'a'.repeat(8193) }), /receipt_layout_invalid/);
  assert.throws(() => renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS, { ...SAMPLE_KITCHEN_RECEIPT, lines: Array(101).fill(SAMPLE_KITCHEN_RECEIPT.lines[0]) }), /receipt_layout_invalid/);
  assert.throws(() => renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS, { ...SAMPLE_KITCHEN_RECEIPT, lines: Array(100).fill(SAMPLE_KITCHEN_RECEIPT.lines[0]) }), /receipt_layout_invalid/);
});

test('customer document contains seller/CVR/address and exact fiscal totals; remote logo cannot become SVG resource', () => {
  const order = { ...SAMPLE_RECEIPT, logoUrl: 'https://example.com/logo.png', seller: { name: 'Restaurant ApS', registrationNumber: '12345678', address: 'Gade 1' } };
  const result = renderCustomerReceiptSvg(DEFAULT_RECEIPT_SETTINGS, order);
  for (const text of ['Restaurant ApS', 'CVR: 12345678', 'Gade 1', 'Betalt']) assert.ok(result.text.includes(text));
  assert.ok(result.text.some(text => text.includes('I alt') && text.includes('208,00')));
  assert.ok(result.text.some(text => text.includes('Heraf moms') && text.includes('41,60')));
  assert.ok(result.logoBox); assert.ok(!result.svg.includes('example.com')); assert.ok(!result.svg.includes('<image'));
  assert.throws(() => renderCustomerReceiptSvg(DEFAULT_RECEIPT_SETTINGS, order, { logoDataUri: 'data:image/svg+xml;base64,PHN2Zz4=' }), /receipt_layout_invalid/);
  assert.throws(() => renderCustomerReceiptSvg(DEFAULT_RECEIPT_SETTINGS, order, { logoDataUri: 'https://private.invalid/' }), /receipt_layout_invalid/);
  const logo = renderCustomerReceiptSvg(DEFAULT_RECEIPT_SETTINGS, order, { logoDataUri: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(logo.height, result.height); assert.deepEqual(logo.logoBox, result.logoBox); assert.match(logo.svg, /<image/);
});
