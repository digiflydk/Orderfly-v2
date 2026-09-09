const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');

const orderFlow = loadTs('src/lib/m3pizza-order-flow.ts');

test('root renders the landing directly instead of redirecting to the legacy alias', () => {
  const source = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.match(source, /brand-site\/m3pizza\/page/);
  assert.doesNotMatch(source, /redirect\s*\(/);
});

for (const [requested, expected] of [
  ['delivery', 'delivery'],
  ['pickup', 'pickup'],
  ['takeaway', 'pickup'],
  ['invalid', 'pickup'],
]) {
  test(`order entry maps ${requested} to Esmeralda Amager ${expected}`, () => {
    assert.equal(
      orderFlow.getM3PizzaMenuHref(requested),
      `/esmeralda/esmeralda-pizza-amager?deliveryMethod=${expected}`,
    );
  });
}
