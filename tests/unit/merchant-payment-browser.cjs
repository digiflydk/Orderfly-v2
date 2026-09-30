// Actual React checkout, receipt, merchant queue/settings and server business
// functions. Only database, identity and Stripe transport use synthetic fixtures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const { loadTs } = require('../helpers/load-ts.cjs');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd(), cases = new Map();
let dir, server, browser, origin;
const fixture = (name, content) => { const file = path.join(dir, name + '.js'); fs.writeFileSync(file, content); return file; };
const scenario = url => url.searchParams.get('case') || (url.searchParams.get('order_id') || '').slice(4) || 'pickup-card';
async function getCase(name) {
  if (!cases.has(name)) cases.set(name, paymentFixture({ createOnly: true, kind: name === 'online-only' ? 'none' : 'code', origin, orderId: 'ORD-' + name,
    locationOverrides: { deliveryFee: 0, minOrder: 0, paymentMethods: name === 'online-only' ? { online: true, payAtPickup: false } : name === 'pickup-only' ? { online: false, payAtPickup: true } : { online: true, payAtPickup: true } },
  }));
  return cases.get(name);
}
async function state(name, receiptProof) {
  const f = await getCase(name), location = f.records.get('locations/l'), brand = f.records.get('brands/b');
  const orders = [...f.records].filter(([key]) => key.startsWith('orders/')).map(([key, order]) => ({
    id: key.slice(7), customerName: order.customerName, locationName: location.name, createdAt: order.createdAt.toISOString(),
    totalAmount: order.totalAmount, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod,
    ...(order.paymentCollection ? { paymentCollection: order.paymentCollection } : {}),
  }));
  return { brand, location, orders, receipt: receiptProof ? await f.receipts.readGuestReceipt({ ...receiptProof, brandId: 'b', locationId: 'l' }) : null,
    kpis: (await f.sales.getSalesDashboardData({ dateFrom: '2026-01-01', dateTo: '2026-12-31' })).kpis,
    paymentLocations: await f.settings.merchantPaymentLocations() };
}
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merchant-payment-browser-'));
  const transport = fixture('transport', `
    export const scenario=new URLSearchParams(window.location.search).get('case')||(new URLSearchParams(window.location.search).get('order_id')||'').slice(4)||'pickup-card';
    export const call=(action,args)=>fetch('/fixture/action?case='+scenario,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,args})}).then(r=>r.json());
  `);
  const cart = fixture('cart', `
    import React from 'react';
    import {basketTotals} from ${JSON.stringify(path.join(root, 'src/lib/basket-totals.ts'))};
    const context=React.createContext(null);
    const item={id:'p',cartItemId:'p',productName:'Pizza',quantity:1,basePrice:100,price:100,toppings:[],itemType:'product',imageUrl:'/image.png'};
    export function FixtureCart({children,brand,location}) {
      const [items,setItems]=React.useState([item]),[discount,setDiscount]=React.useState(null);
      const mode=new URLSearchParams(window.location.search).get('mode')||'pickup';
      const applyDiscount=React.useCallback(d=>setDiscount(d),[]),removeDiscount=React.useCallback(()=>setDiscount(null),[]);
      const setCartContext=React.useCallback(()=>{},[]),setSelectedTime=React.useCallback(()=>{},[]);
      const completeCheckout=React.useCallback(id=>{window.completedFixtureOrder=id;setItems([]);},[]);
      const totals=basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts:[],deliveryType:mode,location,brand,includeBagFee:true});
      const value={...totals,brand,location,cartReady:true,cartItems:items,itemCount:items.length,includeBagFee:true,toggleBagFee:()=>{},standardDiscounts:[],deliveryType:mode,selectedTime:'asap',
        cartDiscount:totals.automaticCartDiscount,appliedDiscount:discount,applyDiscount,removeDiscount,setCartContext,setSelectedTime,completeCheckout,saveCartForCheckout:id=>{window.savedFixtureOrder=id;}};
      return React.createElement(context.Provider,{value},children);
    }
    export const useCart=()=>React.useContext(context);
  `);
  const checkoutActions = fixture('checkout-actions', `
    import {call} from ${JSON.stringify(transport)};
    export const newsletterSyncAvailableAction=async()=>false;
    export const getNewsletterSignupDiscountAction=async()=>null;
    export const validateDiscountAction=(...args)=>call('discount',args);
  `);
  const orderActions = fixture('order-actions', `
    import {call} from ${JSON.stringify(transport)};
    export const registerPickupPayment=(...args)=>call('pay',args);
    export const cancelPickupOrder=(...args)=>call('cancel',args);
  `);
  const entry = fixture('entry', `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CheckoutClient} from ${JSON.stringify(path.join(root, 'src/components/checkout/checkout-client.tsx'))};
    import {ConfirmationClient} from ${JSON.stringify(path.join(root, 'src/app/[brandSlug]/[locationSlug]/checkout/confirmation/confirmation-client.tsx'))};
    import {MerchantOrders} from ${JSON.stringify(path.join(root, 'src/app/merchant/orders/merchant-orders.tsx'))};
    import {PaymentSettings} from ${JSON.stringify(path.join(root, 'src/app/merchant/payments/payment-settings.tsx'))};
    import {AnalyticsProvider} from ${JSON.stringify(path.join(root, 'src/context/analytics-context.tsx'))};
    import {FixtureCart} from ${JSON.stringify(cart)};import {scenario} from ${JSON.stringify(transport)};
    const query=new URLSearchParams(window.location.search);
    fetch('/fixture/state?case='+scenario+'&order_id='+(query.get('order_id')||'')+'&receipt_token='+(query.get('receipt_token')||'')).then(r=>r.json()).then(data=>{
      const props={brand:data.brand,location:data.location};
      const child=window.location.pathname==='/merchant/orders'?React.createElement(MerchantOrders,{orders:data.orders,canEdit:true})
        :window.location.pathname==='/merchant/payments'?React.createElement(PaymentSettings,{locations:data.paymentLocations})
        :window.location.pathname.endsWith('/confirmation')?React.createElement(ConfirmationClient,{...props,order:data.receipt,orderId:query.get('order_id'),receiptToken:query.get('receipt_token')})
        :React.createElement(CheckoutClient,props);
      createRoot(document.getElementById('root')).render(React.createElement(FixtureCart,props,React.createElement(AnalyticsProvider,{brand:data.brand},child)));
    });
  `);
  const aliases = {
    '@/context/cart-context': cart, '@/app/checkout/actions': checkoutActions, '@/app/merchant/orders/actions': orderActions,
    '@/app/superadmin/sales/orders/actions': fixture('statuses', `import {call} from ${JSON.stringify(transport)};export const updateOrderStatus=(...args)=>call('status',args);`),
    [path.join(root, 'src/app/merchant/payments/actions')]: fixture('payment-settings-actions', `import {call} from ${JSON.stringify(transport)};export const savePaymentMethods=(...args)=>call('settings',args);`),
    '@/app/superadmin/brands/actions': fixture('brands', 'export const getBrandBySlug=async()=>null;'),
    '@/hooks/use-toast': fixture('toast', 'export const useToast=()=>({toast:()=>{}});'),
    '@/app/superadmin/locations/client-actions': fixture('times', `export const calculateTimeSlots=()=>({asap_pickup:'Today - 18:20',asap_delivery:'Today - 18:40',pickup_times:['Today - 18:20'],delivery_times:['Today - 18:40']});`),
    [path.join(root, 'src/components/checkout/timeslot-dialog')]: fixture('time-dialog', 'export const TimeSlotDialog=()=>null;'),
    'next/navigation': fixture('navigation', `export const useParams=()=>({brandSlug:'brand',locationSlug:'location'});export const useRouter=()=>({push:url=>window.location.assign(url),refresh:()=>window.location.reload()});export const useSearchParams=()=>new URLSearchParams(window.location.search);export const usePathname=()=>window.location.pathname;`),
    'next/image': fixture('image', `import React from 'react';export default function Image({fill,priority,...props}){return React.createElement('img',props);}`),
    'next/link': fixture('link', `import React from 'react';export const useLinkStatus=()=>({pending:false});export default React.forwardRef(function Link(props,ref){return React.createElement('a',{...props,ref});});`),
    '@': path.join(root, 'src'),
  };
  const loader = fixture('ts-loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;};`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: aliases, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = (await require('postcss')([require('tailwindcss')({ ...loadTs('tailwind.config.ts', { 'tailwindcss-animate': { default: require('tailwindcss-animate') } }).default, content: [path.join(root, 'src/**/*.{ts,tsx}')] })])
    .process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: undefined })).css + '\n' + fs.readFileSync(path.join(root, 'src/styles/commerce-ui.css'), 'utf8');
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin || 'http://localhost'), name = scenario(url); res.setHeader('Cache-Control', 'no-store');
      if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
      if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
      if (url.pathname === '/image.png') { res.statusCode = 204; return res.end(); }
      if (url.pathname === '/fixture/state') {
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(await state(name, url.searchParams.get('order_id') ? { orderId: url.searchParams.get('order_id'), receiptToken: url.searchParams.get('receipt_token') } : null)));
      }
      if (url.pathname === '/fixture/action' || url.pathname === '/api/checkout/session') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const caseName = url.pathname === '/api/checkout/session' ? scenario(new URL(req.headers.referer)) : name;
        const f = await getCase(caseName); let result;
        if (url.pathname === '/api/checkout/session') {
          const { runCheckoutAttempt } = loadTs('src/lib/checkout-attempt.ts', { '@/lib/server/firestore-compat': f.compat });
          const input = JSON.parse(raw); result = await runCheckoutAttempt(req.headers['idempotency-key'], input, () => f.actions.createStripeCheckoutSessionAction(...input));
          if (result.url?.includes('checkout.stripe.test')) result.url = origin + '/stripe?case=' + caseName;
        } else {
          const { action, args } = JSON.parse(raw);
          const actions = loadTs('src/app/merchant/orders/actions.ts', { ...f.mocks, '@/lib/server/settle-checkout': f.settlement, '@/lib/server/pickup-orders': f.cancellation });
          if (action === 'discount') result = await f.actions.validateDiscountAction(...args);
          if (action === 'pay') result = await actions.registerPickupPayment(...args);
          if (action === 'cancel') result = await actions.cancelPickupOrder(...args);
          if (action === 'status') result = await f.statuses.updateOrderStatus(...args);
          if (action === 'settings') result = await loadTs('src/app/merchant/payments/actions.ts', { ...f.mocks, '@/lib/server/merchant-payment-settings': f.settings }).savePaymentMethods(...args);
        }
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
      }
      if (url.pathname === '/stripe') return res.end('Separate hosted Stripe transport fixture');
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main class="max-w-6xl mx-auto p-6"><div id="root"></div></main><script src="/bundle.js"></script>');
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ success: false, error: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, ...(process.env.CART_CHROMIUM_PATH ? { executablePath: process.env.CART_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function pageFor(t, name, url = '/', mobile = false) {
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 } }); t.after(() => context.close());
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [])); await page.goto(origin + url + (url.includes('?') ? '&' : '?') + 'case=' + name); return page;
}
async function submitPromotion(page) {
  await page.getByRole('radio', { name: /^Betal ved afhentning/ }).check();
  await page.getByPlaceholder('John Doe', { exact: true }).fill('QA afhentning');
  await page.getByPlaceholder('john@example.com', { exact: true }).fill('qa@example.test');
  await page.getByPlaceholder('+123456789', { exact: true }).fill('12345678');
  await page.getByText('Har du en rabatkode?', { exact: true }).click(); await page.getByPlaceholder('Indtast rabatkode').fill('SAVE10');
  await page.getByRole('button', { name: 'Anvend', exact: true }).click(); await expect(page.getByText('Rabatkode:')).toBeVisible();
  await page.getByRole('checkbox', { name: /Jeg accepterer|I accept the/ }).first().check();
  await page.getByRole('button', { name: /Bestil og betal ved afhentning/ }).first().click(); await page.waitForURL('**/confirmation?*');
  await expect(page.getByText(/Betales ved afhentning: 94/)).toBeVisible();
}
for (const method of ['cash', 'card']) test(`promotion checkout → receipt → merchant, ${method}, no Stripe and exactly one paid sale`, async t => {
  const name = 'pickup-' + method, page = await pageFor(t, name, '/', method === 'cash'); await submitPromotion(page);
  const receiptUrl = page.url(), f = await getCase(name);
  assert.equal(new URL(receiptUrl).searchParams.has('session_id'), false); assert.equal(f.events.includes('stripe'), false);
  assert.equal(f.order().totalAmount, 94); assert.equal(f.order().paymentStatus, 'Pending'); assert.equal(f.records.get('discounts/d').usedCount, 0);
  await page.goto(origin + '/merchant/orders?case=' + name);
  await expect(page.getByText('Betalte ordrer:', { exact: false })).toHaveText('Betalte ordrer: 0');
  await expect(page.getByText('Betalt omsætning:', { exact: false })).toHaveText(/0,00/);
  await page.getByRole('button', { name: 'Start klargøring', exact: true }).click(); await expect(page.getByText('Tilberedes', { exact: true })).toBeVisible();
  await page.getByLabel('Betalingsform', { exact: true }).selectOption(method);
  await page.getByRole('button', { name: 'Registrér betaling modtaget', exact: true }).click();
  await expect(page.getByText('Betalte ordrer:', { exact: false })).toHaveText('Betalte ordrer: 1');
  await expect(page.getByText('Betalt omsætning:', { exact: false })).toHaveText(/94,00/);
  await expect(page.getByText(/af Testmedarbejder/)).toBeVisible(); assert.equal(f.order().paymentCollection.method, method);
  assert.equal(await f.pay(method), false); assert.equal(f.records.get('discounts/d').usedCount, 1);
  const stats = (await state(name)).kpis; assert.equal(stats.totalOrders, 1); assert.equal(stats.totalSales, 94);
  await page.goto(receiptUrl); await expect(page.getByText(method === 'cash' ? 'Betalt kontant i restaurant' : 'Betalt med kort i restaurant', { exact: true })).toBeVisible();
});
test('merchant cancellation releases a promotion reservation without paid KPI or invoice', async t => {
  const page = await pageFor(t, 'pickup-cancel'); await submitPromotion(page); await page.goto(origin + '/merchant/orders?case=pickup-cancel');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Annullér ubetalt ordre', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Registrér betaling modtaget', exact: true })).toHaveCount(0);
  const f = await getCase('pickup-cancel'); assert.equal(f.order().status, 'Canceled'); assert.equal(f.order().discountReservation, 'released');
  assert.equal((await state('pickup-cancel')).kpis.totalSales, 0); assert.equal(f.records.get('discounts/d').usedCount, 0);
});
test('merchant settings prevent disabling both and update checkout availability for pickup/delivery', async t => {
  const page = await pageFor(t, 'settings', '/merchant/payments');
  await page.getByLabel('Online betaling', { exact: true }).uncheck(); await page.getByLabel('Betal ved afhentning', { exact: true }).uncheck();
  await expect(page.getByRole('alert')).toHaveText('Mindst én betalingsmetode skal være aktiv.'); await expect(page.getByRole('button', { name: 'Gem betalingsmetoder' })).toBeDisabled();
  await page.getByLabel('Betal ved afhentning', { exact: true }).check(); await page.getByRole('button', { name: 'Gem betalingsmetoder' }).click();
  await expect(page.getByRole('status')).toHaveText('Betalingsmetoderne er gemt.');
  await page.goto(origin + '/?case=settings'); await expect(page.getByRole('radio', { name: /^Betal ved afhentning/ })).toHaveCount(1); await expect(page.getByRole('radio', { name: /^Online betaling/ })).toHaveCount(0);
  await page.goto(origin + '/?case=settings&mode=delivery'); await expect(page.getByRole('radio')).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('Restauranten tilbyder ikke en betalingsmetode til levering');
  await expect(page.getByRole('button', { name: /Gå til betaling/ }).first()).toBeDisabled();
});
test('disabled pickup is hidden while existing online merchants retain hosted checkout', async t => {
  const page = await pageFor(t, 'online-only'); await expect(page.getByRole('radio', { name: /^Online betaling/ })).toBeChecked(); await expect(page.getByRole('radio', { name: /^Betal ved afhentning/ })).toHaveCount(0);
  await page.getByPlaceholder('John Doe').fill('QA online'); await page.getByPlaceholder('john@example.com').fill('qa-online@example.test'); await page.getByPlaceholder('+123456789').fill('12345678');
  await page.getByRole('checkbox', { name: /Jeg accepterer|I accept the/ }).first().check(); await page.getByRole('button', { name: /Gå til betaling/ }).first().click(); await page.waitForURL('**/stripe?*');
  const f = await getCase('online-only'); assert.equal(f.events.filter(e => e === 'stripe').length, 1); assert.equal(f.order().status, 'Pending'); assert.equal((await state('online-only')).kpis.totalSales, 0);
  const session = { id: 'cs_test_mock', payment_status: 'paid', currency: 'dkk', amount_total: 10400, metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  assert.equal(await f.settlement.settlePaidCheckoutSession(session), true); assert.equal(await f.settlement.settlePaidCheckoutSession(session), false);
  assert.equal((await state('online-only')).kpis.totalSales, 104); assert.equal(f.order().status, 'Received');
});
