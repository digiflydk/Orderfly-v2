const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { renderKitchenReceipt: render, KitchenReceiptError } = loadTs('src/lib/printing/kitchen-receipt.ts');

// Synthetic kitchen-only snapshot. No live order, customer, payment or printer identity.
const fixture = patch => ({
  orderReference: 'TEST 42', fulfillmentLabel: 'Afhentning', fulfillmentTime: '21.10.2026 18:30',
  items: [
    { quantity: 2, name: 'Pizza med bøffelmozzarella', modifiers: ['Uden løg', 'Ekstra ægte ost'], kitchenNote: 'Skær i otte stykker' },
    { quantity: 1, name: 'Pasta ÆØÅ æøå' },
  ],
  kitchenNote: 'Kun køkken, ingen kundedata', ...patch,
});
const invalid = fn => assert.throws(fn, error => error instanceof KitchenReceiptError && error.code === 'invalid_snapshot');

test('58mm named preview fixture has deterministic Danish kitchen content and indentation', () => {
  const result = render(fixture());
  assert.equal(result.text, [
    'KITCHEN', 'Order: TEST 42', 'Type: Afhentning', 'Time: 21.10.2026 18:30',
    '--------------------------------', '2 x Pizza med bøffelmozzarella',
    '  + Uden løg', '  + Ekstra ægte ost', '  Note: Skær i otte stykker',
    '1 x Pasta ÆØÅ æøå', '--------------------------------', 'Note: Kun køkken, ingen', '      kundedata', '',
  ].join('\n'));
  assert.deepEqual(result.preview, { paperWidthMm: 58, columns: 32, columnUnit: 'grapheme', physicalFitVerified: false });
  assert.equal(result.utf8Bytes, Buffer.byteLength(result.text));
  assert.equal('contentType' in result, false);
  assert.equal('bytes' in result, false);
});

test('80mm named preview fixture is independent of timezone, clock and caller mutation', () => {
  const input = fixture({ items: [{ quantity: 3, name: 'En meget lang pizza med friske danske råvarer og ost' }] });
  const before = JSON.stringify(input);
  const expected = [
    'KITCHEN', 'Order: TEST 42', 'Type: Afhentning', 'Time: 21.10.2026 18:30',
    '------------------------------------------------',
    '3 x En meget lang pizza med friske danske', '    råvarer og ost',
    '------------------------------------------------', 'Note: Kun køkken, ingen kundedata', '',
  ].join('\n');
  assert.equal(render(input, { paperWidthMm: 80 }).text, expected);
  assert.equal(render(input, { paperWidthMm: 80 }).text, expected);
  assert.equal(JSON.stringify(input), before);
});

test('explicit preview columns wrap words, long Unicode names, modifiers and notes without dropping text', () => {
  const input = fixture({
    items: [{ quantity: 99, name: '界'.repeat(38), modifiers: ['Crème brûlée med æble og bær'], kitchenNote: 'あ'.repeat(31) }],
    kitchenNote: 'Meget lang fælles køkkenbemærkning',
  });
  const result = render(input, { paperWidthMm: 58, columns: 16 });
  for (const line of result.text.trimEnd().split('\n')) {
    assert.ok([...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(line)].length <= 16, line);
  }
  assert.equal((result.text.match(/界/g) ?? []).length, 38);
  assert.equal((result.text.match(/あ/g) ?? []).length, 31);
  assert.match(result.text, /99 x 界/);
  assert.match(result.text, /  \+ Crème/);
  assert.match(result.text, /  Note: あ/);
  assert.match(result.text, /Note: Meget lang/);
});

test('NFC combines Danish text and grapheme wrapping preserves accents and emoji', () => {
  const result = render(fixture({
    items: [{ quantity: 1, name: 'A\u030A '.repeat(12) + '🍕🍕' }], kitchenNote: undefined,
  }), { paperWidthMm: 80, columns: 16 });
  assert.equal((result.text.match(/Å/g) ?? []).length, 12);
  assert.equal((result.text.match(/🍕/gu) ?? []).length, 2);
  assert.equal(result.text.includes('\u030A'), false);
});

test('unknown top-level and nested fields reject arbitrary order/provider/private data without echoing it', () => {
  for (const field of ['address', 'email', 'phone', 'paymentToken', 'receiptToken', 'sessionToken', 'credentials', 'providerPayload', 'order']) {
    const secret = `PRIVATE_${field}`;
    assert.throws(() => render(fixture({ [field]: secret })), error => error.message === 'invalid_snapshot' && !error.message.includes(secret));
    invalid(() => render(fixture({ items: [{ quantity: 1, name: 'Pizza', [field]: secret }] })));
  }
});

test('snapshot validates required fields, quantities, text, array boundaries and strict shapes', () => {
  for (const value of [null, [], {}, 'not snapshot', fixture({ items: [] }), fixture({ fulfillmentTime: undefined }), fixture({ orderReference: '   ' }),
    fixture({ fulfillmentLabel: 7 }), fixture({ items: new Array(51).fill({ quantity: 1, name: 'Pizza' }) })]) invalid(() => render(value));
  for (const quantity of [0, -1, 1.5, 100, NaN, Infinity, '1']) invalid(() => render(fixture({ items: [{ quantity, name: 'Pizza' }] })));
  for (const name of ['', 'x'.repeat(161)]) invalid(() => render(fixture({ items: [{ quantity: 1, name }] })));
  invalid(() => render(fixture({ items: [{ quantity: 1, name: 'Pizza', modifiers: new Array(9).fill('Ost') }] })));
  invalid(() => render(fixture({ kitchenNote: 'x'.repeat(401) })));
  invalid(() => render(fixture({ items: [{ quantity: 1, name: 'Pizza', kitchenNote: 'x'.repeat(401) }] })));
});

test('controls, printer command escapes, bidi and malformed Unicode cannot create structure or device instructions', () => {
  for (const control of ['\x00', '\x1b@', '\x1dV', '\x07', '\t', '\r', '\n', '\x7f', '\x85', '\u2028', '\u2029', '\u202e', '\u2066', '\ud800', '\udfff']) {
    for (const patch of [
      { orderReference: 'TEST' + control }, { fulfillmentLabel: 'Pickup' + control }, { fulfillmentTime: '18:30' + control },
      { items: [{ quantity: 1, name: 'Pizza' + control }] },
      { items: [{ quantity: 1, name: 'Pizza', modifiers: ['Ost' + control] }] },
      { items: [{ quantity: 1, name: 'Pizza', kitchenNote: 'Note' + control }] }, { kitchenNote: 'Note' + control },
    ]) invalid(() => render(fixture(patch)));
  }
});

test('literal markup is never interpreted as printer commands or HTML', () => {
  const result = render(fixture({ items: [{ quantity: 1, name: '<b>Pizza</b> [cut] & <drawer>' }], kitchenNote: undefined }));
  assert.match(result.text, /<b>Pizza<\/b> \[cut\] &/);
  assert.match(result.text, /<drawer>/);
  assert.equal(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(result.text), false);
});

test('preview profiles reject unsupported physical widths and unbounded/fractional columns', () => {
  for (const profile of [null, {}, { paperWidthMm: '58' }, { paperWidthMm: 57 }, { paperWidthMm: 80, columns: 15 },
    { paperWidthMm: 58, columns: 81 }, { paperWidthMm: 80, columns: 32.5 }, { paperWidthMm: 58, font: 'device-default' }]) {
    assert.throws(() => render(fixture(), profile), error => error.code === 'invalid_profile');
  }
  assert.equal(render(fixture(), { paperWidthMm: 80, columns: 40 }).preview.columns, 40);
});

test('aggregate accepted text and generated output have hard independent limits', () => {
  const items = new Array(50).fill({ quantity: 1, name: 'x'.repeat(160), modifiers: ['y'.repeat(160)] });
  assert.throws(() => render(fixture({ items })), error => error.code === 'receipt_too_large');
  const wideUtf8 = new Array(45).fill({ quantity: 1, name: '界'.repeat(160) });
  assert.throws(() => render(fixture({ items: wideUtf8, kitchenNote: undefined }), { paperWidthMm: 58, columns: 16 }), error => error.code === 'receipt_too_large');
});

test('maximum item and quantity boundaries remain accepted for ordinary bounded content', () => {
  const result = render(fixture({ items: new Array(50).fill({ quantity: 99, name: 'Pizza' }), kitchenNote: undefined }));
  assert.equal((result.text.match(/^99 x Pizza$/gm) ?? []).length, 50);
  assert.ok(result.utf8Bytes < 32768);
});
