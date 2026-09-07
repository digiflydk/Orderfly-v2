// Focused local Chromium checks of the production CartProvider. No Next build,
// GitHub Actions, production database, customer data or real Stripe sessions.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const f = require('../helpers/cart-fixture.cjs');
let browser, server, origin, catalog;

const app = `
import React, { useEffect } from 'react';
import { CartProvider, useCart } from '/src/context/cart-context';
const product = ${JSON.stringify(f.product)}, combo = ${JSON.stringify(f.combo)};
function Flow() {
  const cart = useCart(), route = window.location.pathname, params = new URLSearchParams(location.search);
  useEffect(() => {
    if (route.includes('cancel') || route.includes('confirmation')) return;
    cart.setCartContext({id:route === '/other' ? 'other' : 'b', slug:'brand',bagFee:4,vatPercentage:25}, {id:route === '/other' ? 'other-location' : 'l',slug:'location',deliveryFee:20});
  }, [route, cart.setCartContext]);
  useEffect(() => {
    if (route.includes('confirmation') && params.get('status') === 'Paid') {
      cart.completeCheckout(params.get('order'),params.get('brand') || 'b','l');
      window.receiptProcessed = true;
    }
  }, [cart.completeCheckout]);
  const output = {ready:cart.cartReady,items:cart.cartItems,total:cart.checkoutTotal,deliveryType:cart.deliveryType,includeBagFee:cart.includeBagFee,brandId:cart.brand?.id};
  return React.createElement('div',null,
    React.createElement('pre',{id:'state'},JSON.stringify(output)),
    React.createElement('button',{id:'pizza',onClick:()=>cart.addToCart(product,1,[],75,75)},'Add pizza'),
    React.createElement('button',{id:'topping',onClick:()=>cart.addToCart(product,1,[{name:'Cheese',price:10}],75,75)},'Add with cheese'),
    React.createElement('button',{id:'combo',onClick:()=>cart.addComboToCart(combo,1,[{groupName:'Pizza',products:[{id:'pizza',name:'Italiana'}]}],100)},'Add combo'),
    React.createElement('button',{id:'quantity',onClick:()=>cart.updateQuantity(cart.cartItems[0].cartItemId,3)},'Set three'),
    React.createElement('button',{id:'remove',onClick:()=>cart.removeFromCart(cart.cartItems.at(-1).cartItemId)},'Remove last'),
    React.createElement('button',{id:'pickup',onClick:()=>cart.setDeliveryType('pickup')},'Pickup'),
    React.createElement('button',{id:'delivery',onClick:()=>cart.setDeliveryType('delivery')},'Delivery'),
    React.createElement('button',{id:'with-bag',onClick:()=>cart.toggleBagFee(true)},'Include bag'),
    React.createElement('button',{id:'without-bag',onClick:()=>cart.toggleBagFee(false)},'No bag'),
    React.createElement('button',{id:'pay',onClick:()=>{cart.saveCartForCheckout(params.get('order') || 'ORD-ONE');window.location.assign('/stripe');}},'Pay'),
    React.createElement('a',{href:'/checkout',id:'return'},'Return to Checkout')
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,
  window.location.pathname === '/stripe' ? React.createElement('a',{id:'cancel',href:'/checkout/cancel'},'Cancel test payment') : React.createElement(CartProvider,null,React.createElement(Flow))));
`;
const html = `<!doctype html><div id="root"></div>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script type="importmap">{"imports":{"react":"/react-module","react/jsx-runtime":"/jsx-runtime","zod":"/zod/v3/index.js","js-cookie":"/cookies"}}</script>
<script type="module" src="/fixture.js"></script>`;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      res.setHeader('Cache-Control', 'no-store');
      if (route === '/restore') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const input = JSON.parse(raw);
        const result = f.restoreCartItems(input.choices, catalog, { ...input, now: f.scope.now });
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ...result, discounts: catalog.discounts }));
      }
      res.setHeader('Content-Type', 'application/javascript');
      if (route === '/react.js') return res.end(fs.readFileSync('node_modules/react/umd/react.development.js'));
      if (route === '/react-dom.js') return res.end(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js'));
      if (route === '/react-module') return res.end('export default window.React; export const {createContext,useContext,useState,useCallback,useEffect,useRef,useMemo}=window.React;');
      if (route === '/jsx-runtime') return res.end('export const Fragment=React.Fragment;export function jsx(type,props,key){return React.createElement(type,{...props,key});}export const jsxs=jsx;');
      if (route === '/cookies') return res.end('export default {set(){}};');
      if (route === '/fixture.js') return res.end(app);
      if (route === '/src/app/cart-actions') return res.end(`export async function restoreCartAction(input){const r=await fetch('/restore',{method:'POST',body:JSON.stringify(input)});if(!r.ok)throw Error('catalog unavailable');return r.json();}`);
      if (route.startsWith('/zod/') && !route.includes('..')) return res.end(fs.readFileSync(path.join('node_modules', route)));
      if (route.startsWith('/src/') && !route.includes('..')) {
        const local = route.slice(1), file = fs.existsSync(local + '.tsx') ? local + '.tsx' : local + '.ts';
        const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
        return res.end(code.replaceAll("'@/", "'/src/"));
      }
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CART_CHROMIUM_PATH ? { executablePath: process.env.CART_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function setup(t, route = '/') {
  catalog = f.catalog(); const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + route); await ready(page);
  return page;
}
const state = page => page.locator('#state').textContent().then(JSON.parse);
const ready = page => page.waitForFunction(() => JSON.parse(document.querySelector('#state')?.textContent || '{}').ready);
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), f.CART_STORAGE_KEY);
const count = (page, quantity) => page.waitForFunction(q => JSON.parse(document.querySelector('#state').textContent).items.reduce((sum, item) => sum + item.quantity, 0) === q, quantity);

test('menu refresh and direct checkout restore quantities, toppings, combos and current prices', async t => {
  const page = await setup(t, '/?deliveryMethod=pickup');
  await page.click('#pizza'); await page.click('#pizza'); await count(page, 2);
  await page.reload(); await ready(page); await count(page, 2);
  assert.equal((await state(page)).total, 154);
  await page.click('#topping'); await page.click('#combo'); await count(page, 4);
  await page.goto(origin + '/checkout'); await ready(page); await count(page, 4);
  const s = await state(page); assert.equal(s.brandId, 'b'); assert.equal(s.items[1].toppings[0].name, 'Cheese'); assert.equal(s.items[2].comboSelections[0].products[0].id, 'pizza');
  catalog.products[0].price = 90;
  await page.reload(); await ready(page); assert.equal((await state(page)).items[0].price, 90);
});

test('full-page Stripe cancel and cancel refresh retain basket; changes are saved for a fresh checkout', async t => {
  const page = await setup(t); await page.click('#pizza'); await page.click('#combo'); await count(page, 2);
  await page.click('#pay'); await page.waitForURL('**/stripe');
  assert.equal((await saved(page)).checkoutOrderId, 'ORD-ONE');
  await page.click('#cancel'); await page.waitForURL('**/checkout/cancel'); await page.reload();
  await page.click('#return'); await ready(page); await count(page, 2);
  await page.click('#quantity'); await page.click('#remove'); await count(page, 3);
  assert.equal((await state(page)).total, 229);
  assert.equal((await saved(page)).checkoutOrderId, undefined);
  await page.goto(origin + '/checkout?order=ORD-TWO'); await ready(page); await count(page, 3);
  await page.click('#pay'); await page.waitForURL('**/stripe');
  const snapshot = await saved(page); assert.equal(snapshot.checkoutOrderId, 'ORD-TWO'); assert.equal(snapshot.choices[0].quantity, 3); assert.equal(snapshot.choices.length, 1);
});

test('URL overrides saved delivery and restaurant change never mixes carts', async t => {
  const page = await setup(t); await page.click('#pizza'); await count(page, 1);
  await page.goto(origin + '/?deliveryMethod=delivery'); await ready(page);
  assert.equal((await state(page)).deliveryType, 'delivery'); assert.equal((await state(page)).total, 104);
  await page.goto(origin + '/?deliveryMethod=takeaway'); await ready(page);
  assert.equal((await state(page)).deliveryType, 'pickup'); assert.equal((await state(page)).total, 79);
  await page.goto(origin + '/other'); await ready(page); await count(page, 0);
  assert.equal(await saved(page), null);
  await page.goto(origin + '/'); await ready(page); await count(page, 0);
});

test('refresh removes expired item pricing and reports unavailable items', async t => {
  const page = await setup(t); await page.click('#pizza'); await count(page, 1);
  catalog.discounts = [{ ...f.discount }];
  await page.reload(); await ready(page); assert.equal((await state(page)).items[0].price, 60);
  catalog.discounts[0].endDate = '2026-09-06';
  await page.reload(); await ready(page); assert.equal((await state(page)).items[0].price, 75);
  catalog.products[0].isActive = false;
  await page.reload(); await ready(page); await count(page, 0);
  assert.match(await page.locator('[role=status]').textContent(), /ikke længere tilgængelige/);
});

test('only the matching paid checkout clears storage, without erasing a newer or another-brand basket', async t => {
  const page = await setup(t); await page.click('#pizza'); await count(page, 1);
  await page.click('#pay'); await page.waitForURL('**/stripe');
  for (const params of ['order=ORD-ONE&status=Pending', 'order=ORD-OTHER&status=Paid', 'order=ORD-ONE&status=Paid&brand=other']) {
    await page.goto(origin + '/checkout/confirmation?' + params); await page.locator('#state').waitFor();
    assert.equal((await saved(page)).checkoutOrderId, 'ORD-ONE');
  }
  await page.goto(origin + '/checkout/confirmation?order=ORD-ONE&status=Paid');
  await page.waitForFunction(key => !localStorage.getItem(key), f.CART_STORAGE_KEY);
  await page.goto(origin + '/'); await ready(page); await count(page, 0);
  await page.click('#pizza'); await count(page, 1); await page.click('#pay'); await page.waitForURL('**/stripe');
  await page.goto(origin + '/checkout'); await ready(page); await page.click('#quantity'); await count(page, 3);
  await page.goto(origin + '/checkout/confirmation?order=ORD-ONE&status=Paid'); await page.locator('#state').waitFor();
  assert.equal((await saved(page)).choices[0].quantity, 3);
});

test('catalog failure preserves the saved cart until successful retry, and corrupt storage does not crash', async t => {
  const page = await setup(t); await page.click('#pizza'); await count(page, 1);
  const snapshot = await saved(page);
  await page.route('**/restore', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.reload(); await page.getByText('Kurven kunne ikke indlæses.', { exact: false }).waitFor();
  assert.deepEqual(await saved(page), snapshot);
  await page.unroute('**/restore'); await page.getByRole('button', { name: 'Prøv igen' }).click(); await ready(page); await count(page, 1);
  await page.evaluate(key => localStorage.setItem(key, '{broken'), f.CART_STORAGE_KEY);
  await page.reload(); await ready(page); await count(page, 0);
});

test('changed fulfillment or bag choice survives an old paid confirmation in another tab', async t => {
  for (const scenario of [
    { name: 'pickup to delivery', initialType: 'pickup', change: 'delivery', finalType: 'delivery', initialBag: true, finalBag: true },
    { name: 'delivery to pickup', initialType: 'delivery', change: 'pickup', finalType: 'pickup', initialBag: true, finalBag: true },
    { name: 'remove bag', initialType: 'pickup', change: 'without-bag', finalType: 'pickup', initialBag: true, finalBag: false },
    { name: 'add bag', initialType: 'pickup', change: 'with-bag', finalType: 'pickup', initialBag: false, finalBag: true },
  ]) await t.test(scenario.name, async subtest => {
    const paymentTab = await setup(subtest, '/?deliveryMethod=' + scenario.initialType);
    await paymentTab.click('#pizza'); await count(paymentTab, 1);
    if (!scenario.initialBag) await paymentTab.click('#without-bag');
    await paymentTab.click('#pay'); await paymentTab.waitForURL('**/stripe');
    assert.equal((await saved(paymentTab)).checkoutOrderId, 'ORD-ONE');

    const cartTab = await paymentTab.context().newPage();
    await cartTab.goto(origin + '/checkout'); await ready(cartTab);
    await cartTab.click('#' + scenario.change); await ready(cartTab);
    assert.equal((await state(cartTab)).deliveryType, scenario.finalType);
    assert.equal((await state(cartTab)).includeBagFee, scenario.finalBag);

    // Same browser context shares storage, as two real customer tabs do.
    await paymentTab.goto(origin + '/checkout/confirmation?order=ORD-ONE&status=Paid');
    await paymentTab.waitForFunction(() => window.receiptProcessed === true);
    const modified = await saved(paymentTab);
    assert.ok(modified, 'The old payment must not delete the modified basket');
    assert.equal(modified.checkoutOrderId, undefined);
    assert.equal(modified.deliveryType, scenario.finalType);
    assert.equal(modified.includeBagFee, scenario.finalBag);
    await cartTab.reload(); await ready(cartTab); await count(cartTab, 1);
    assert.equal((await state(cartTab)).deliveryType, scenario.finalType);
    assert.equal((await state(cartTab)).includeBagFee, scenario.finalBag);

    // A new checkout for this exact basket can still finish normally.
    await cartTab.goto(origin + '/checkout?order=ORD-TWO'); await ready(cartTab);
    await cartTab.click('#pay'); await cartTab.waitForURL('**/stripe');
    await paymentTab.goto(origin + '/checkout/confirmation?order=ORD-TWO&status=Paid');
    await paymentTab.waitForFunction(() => window.receiptProcessed === true);
    assert.equal(await saved(paymentTab), null);
  });
});
