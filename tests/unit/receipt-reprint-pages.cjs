const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function page(kind, options = {}) {
  const calls = [];
  const order = { id: 'ORD-1', brandId: 'brand', locationId: 'location', invoice: {} };
  const mocks = {
    'next/navigation': { notFound: () => { throw Error('not_found'); } },
    '@/components/superadmin/admin-link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
    '@/components/ui/button': { Button: ({ children }) => React.createElement('span', null, children) },
    '@/components/receipts/reprint-controls': { ReprintControls: props => React.createElement('div', { 'data-reprint': JSON.stringify(props) }) },
    '@/components/receipts/kitchen-receipt-preview': { KitchenReceiptPreview: () => React.createElement('article', null, 'Kitchen preview') },
    '@/components/receipts/receipt-preview': { ReceiptPreview: () => React.createElement('article', null, 'Customer preview') },
    '@/lib/receipts/kitchen-preview': { projectKitchenReceipt: () => ({}) },
    '@/lib/receipts/preview': { projectReceipt: () => ({}) },
    '@/lib/access/orderfly-session': { orderflySession: async () => { calls.push('authenticate'); if (options.denied) throw Error('unauthorized'); return { superuser: !!options.superuser }; } },
    '@/lib/access/order-details': { getOrderDetails: async id => { calls.push(['order', id]); return options.missing ? null : order; } },
    '@/lib/receipts/kitchen-settings-server': { readKitchenSettingsForOrder: async (...scope) => { calls.push(['settings', ...scope]); return { settings: { groupByCategory: true } }; } },
    '@/lib/receipts/kitchen-categories-server': { readKitchenCategoriesForOrder: async () => ({}) },
    '@/lib/receipts/settings-server': { readReceiptSettingsForOrder: async (...scope) => { calls.push(['settings', ...scope]); return { settings: {}, brandIdentity: {} }; } },
  };
  const filename = `src/app/superadmin/sales/orders/[orderId]/${kind === 'kitchen' ? 'kitchen-receipt' : 'receipt'}/page.tsx`;
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return { calls, render: async () => renderToStaticMarkup(await mod.exports.default({ params: Promise.resolve({ orderId: 'ORD-1' }) })) };
}

for (const kind of ['kitchen', 'customer']) {
  test(`${kind} receipt page authenticates before reading and exposes scoped physical reprint only to superuser`, async () => {
    const allowed = page(kind, { superuser: true });
    const html = await allowed.render();
    assert.deepEqual(allowed.calls[0], 'authenticate');
    assert.deepEqual(allowed.calls[1], ['order', 'ORD-1']);
    assert.deepEqual(allowed.calls[2], ['settings', 'brand', 'location']);
    assert.match(html, /data-reprint=/);
    for (const value of ['ORD-1', 'brand', 'location', kind]) assert.ok(html.includes(value));
    const readonly = page(kind, { superuser: false });
    const preview = await readonly.render();
    assert.match(preview, /preview/); assert.doesNotMatch(preview, /data-reprint=/);
    const denied = page(kind, { denied: true });
    await assert.rejects(denied.render(), /unauthorized/); assert.deepEqual(denied.calls, ['authenticate']);
    const missing = page(kind, { superuser: true, missing: true });
    await assert.rejects(missing.render(), /not_found/); assert.equal(missing.calls.length, 2);
  });
}
