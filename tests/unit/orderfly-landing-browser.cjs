// Orderfly marketing landing (#814): renders the real component with React's
// server renderer and the real stylesheet, then checks the mobile-first layout
// in Chromium at 320/390/820/1440 px. No network beyond the local fixture.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');

function loadTsx(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name.startsWith('.')) return loadTsx(path.resolve(path.dirname(file), `${name}.ts`));
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}

const content = loadTsx('src/components/orderfly-landing/content.ts');
const { OrderflyLanding } = loadTsx('src/components/orderfly-landing/orderfly-landing.tsx');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const markup = renderToStaticMarkup(React.createElement(OrderflyLanding));
const css = fs.readFileSync('src/components/orderfly-landing/orderfly-landing.css', 'utf8');

let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="margin:0">${markup}</body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); server?.close(); });

async function open(t, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const foreign = [], errors = [];
  page.on('request', request => { if (!request.url().startsWith(origin)) foreign.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => { assert.deepEqual(foreign, [], 'no third-party requests'); assert.deepEqual(errors, []); });
  await page.goto(origin + '/');
  return page;
}

test('markup: static, one h1, every feature from the codebase, honest CTAs and no form', () => {
  assert.doesNotMatch(markup, /<script|<form|<input|<iframe/);
  assert.equal(markup.match(/<h1/g).length, 1);
  assert.equal(content.FEATURES.length, 12);
  for (const feature of content.FEATURES) assert.ok(markup.includes(feature.title.replace('&', '&amp;')), feature.title);
  assert.deepEqual(content.FEATURES.filter(f => f.comingSoon).map(f => f.title), ['Levering med Wolt Drive']);
  assert.ok(markup.includes(`href="mailto:${content.ORDERFLY_CONTACT_EMAIL}?subject=`));
  assert.doesNotMatch(markup, /\[PRIS\]|\[Kundelogo\]|\[Dit brand\]|lorem/i, 'no placeholders on the live page');
  assert.doesNotMatch(markup, /\d+\s*kr\.?\/md/, 'no invented prices');
});

for (const width of [320, 390, 820, 1440]) {
  test(`layout at ${width}px: no horizontal scroll, correct navigation, touch targets and contrast`, { timeout: 30000 }, async t => {
    const page = await open(t, width);
    const result = await page.evaluate(() => {
      const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
      const background = el => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] === 1)) return c.slice(0, 3); } return [255, 255, 255]; };
      const lowContrast = [];
      for (const el of document.querySelectorAll('.ofl *')) {
        if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
        const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!ownText) continue;
        const a = lum(rgb(getComputedStyle(el).color).slice(0, 3)), b = lum(background(el));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) lowContrast.push(`${el.textContent.trim().slice(0, 40)} ${ratio.toFixed(2)}`);
      }
      const smallTargets = [...document.querySelectorAll('.ofl a, .ofl summary')]
        .filter(el => visible(el) && !el.classList.contains('ofl-skip'))
        .filter(el => { const r = el.getBoundingClientRect(); return r.height < 44; })
        .map(el => el.textContent.trim().slice(0, 30));
      const overflow = [...document.querySelectorAll('.ofl *')].filter(el => visible(el) && !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className || el.tagName);
      return {
        scrollWidth: document.documentElement.scrollWidth, innerWidth,
        mobileMenu: visible(document.querySelector('.ofl-mobile-menu')),
        desktopNav: visible(document.querySelector('.ofl-nav-links')),
        terminal: visible(document.querySelector('.ofl-terminal')),
        phone: visible(document.querySelector('.ofl-phone')),
        featureColumns: getComputedStyle(document.querySelector('.ofl-features')).gridTemplateColumns.split(' ').length,
        lowContrast, smallTargets, overflow,
      };
    });
    assert.ok(result.scrollWidth <= result.innerWidth, `scrollWidth ${result.scrollWidth} > ${result.innerWidth}`);
    assert.deepEqual(result.overflow, []);
    assert.deepEqual(result.lowContrast, []);
    assert.deepEqual(result.smallTargets, []);
    assert.equal(result.phone, true);
    if (width < 900) {
      assert.equal(result.mobileMenu, true); assert.equal(result.desktopNav, false); assert.equal(result.terminal, false);
    } else {
      assert.equal(result.mobileMenu, false); assert.equal(result.desktopNav, true); assert.equal(result.terminal, true);
    }
    assert.equal(result.featureColumns, width < 600 ? 1 : width < 900 ? 2 : width < 1100 ? 3 : 4);
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), `orderfly-landing-${width}.png`), fullPage: true });
  });
}

test('mobile menu opens and closes with the keyboard and its links navigate in-page', { timeout: 30000 }, async t => {
  const page = await open(t, 390);
  const panel = page.locator('.ofl-mobile-panel');
  assert.equal(await panel.isVisible(), false);
  const summary = page.locator('.ofl-mobile-menu summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(await panel.isVisible(), true);
  for (const label of ['Funktioner', 'Sådan virker det', 'Loyalitet', 'Pakker', 'FAQ', 'Log ind', 'Book en demo'])
    assert.equal(await panel.getByRole('link', { name: label, exact: true }).isVisible(), true, label);
  await page.keyboard.press('Enter');
  assert.equal(await panel.isVisible(), false);
  await summary.click();
  await panel.getByRole('link', { name: 'Funktioner', exact: true }).click();
  await page.waitForFunction(() => location.hash === '#funktioner');
  const top = await page.locator('#funktioner').evaluate(el => el.getBoundingClientRect().top);
  assert.ok(top < 200, `section scrolled into view (${top})`);
});

test('FAQ answers expand with the keyboard', { timeout: 30000 }, async t => {
  const page = await open(t, 320);
  const first = page.locator('.ofl-faq-list details').first();
  assert.equal(await first.locator('p').isVisible(), false);
  await first.locator('summary').focus();
  await page.keyboard.press('Space');
  assert.equal(await first.locator('p').isVisible(), true);
});
