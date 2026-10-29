const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('@playwright/test');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/components/feedback/feedback-rating.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { FeedbackRating } = mod.exports;
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CART_CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }); });
after(async () => { await browser?.close(); });
for (const width of [390, 1280]) {
  test(`fractional and whole rating are accurate and accessible (${width}px)`, async t => {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    t.after(() => page.close());
    await page.setContent(renderToStaticMarkup(React.createElement('main', {},
      ...[3.2, 4, 5, 1].map(rating => React.createElement('div', { key: rating }, React.createElement(FeedbackRating, { rating }))))));
    const fractional = page.getByRole('img', { name: '3,2 ud af 5 stjerner', exact: true });
    assert.equal(await fractional.innerText(), '3,2 / 5');
    const fills = await fractional.locator('span[style*="overflow"]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    [16, 16, 16, 3.2, 0].forEach((expected, i) => assert.ok(Math.abs(fills[i] - expected) < 0.05, `star ${i + 1}: ${fills[i]}`));
    for (const rating of [1, 4, 5]) {
      const row = page.getByRole('img', { name: `${rating} ud af 5 stjerner`, exact: true });
      assert.equal(await row.innerText(), `${rating} / 5`);
      const widths = await row.locator('span[style*="overflow"]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
      assert.equal(widths.filter(value => value === 16).length, rating);
      assert.equal(widths.filter(value => value === 0).length, 5 - rating);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
}
test('missing, legacy zero and invalid ratings are not presented as scored reviews', async t => {
  const page = await browser.newPage(); t.after(() => page.close());
  await page.setContent(renderToStaticMarkup(React.createElement('main', {},
    ...[undefined, null, 0, NaN, Infinity, -1, 6].map((rating, key) => React.createElement('div', { key }, React.createElement(FeedbackRating, { rating }))))));
  assert.equal(await page.getByText('Ingen bedømmelse', { exact: true }).count(), 7);
  assert.equal(await page.getByRole('img').count(), 0);
});
