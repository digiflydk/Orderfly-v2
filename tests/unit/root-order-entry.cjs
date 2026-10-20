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
      `/esmeralda/amager?deliveryMethod=${expected}`,
    );
  });
}

test('order entry on orderfly.dk continues on the brand subdomain; other hosts stay relative', () => {
  for (const host of ['orderfly.dk', 'www.orderfly.dk', 'orderfly.dk:443'])
    assert.equal(orderFlow.getM3PizzaOrderEntryUrl(host, 'takeaway'), 'https://esmeralda.orderfly.dk/amager?deliveryMethod=pickup', host);
  assert.equal(orderFlow.getM3PizzaOrderEntryUrl('orderfly.dk', 'delivery'), 'https://esmeralda.orderfly.dk/amager?deliveryMethod=delivery');
  assert.equal(orderFlow.getM3PizzaOrderEntryUrl('esmeralda.orderfly.dk', 'delivery'), '/amager?deliveryMethod=delivery');
  for (const host of ['localhost:3000', '127.0.0.1:3000', 'preview.example.test', null])
    assert.equal(orderFlow.getM3PizzaOrderEntryUrl(host, 'invalid'), '/esmeralda/amager?deliveryMethod=pickup', String(host));
});

test('the landing order modal uses the subdomain entry, not a hard-coded /{brand}/{location} push', () => {
  const source = fs.readFileSync('src/app/brand-site/m3pizza/landing-client.tsx', 'utf8');
  assert.match(source, /browserOrderEntryUrl\(brand\.slug, location\.slug\)/);
  assert.match(source, /window\.location\.assign\(target\)/);
  assert.doesNotMatch(source, /router\.push\(`\/\$\{brand\.slug\}/);
});
