const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');
const { canNavigate } = loadTs('src/lib/access/navigation.ts');

function fixture({ permissions = ['orderfly.catalog:view'], failure, catalogs = {}, superuser = true } = {}) {
  const calls = [], props = [];
  const mocks = {
    '@/lib/access/orderfly-session': { orderflySession: async () => ({ superuser, permissions, actorId: 'synthetic-actor' }) },
    '@/lib/access/navigation': { canNavigate },
    '@/lib/access/native-catalog': { nativeCatalog: async permission => { calls.push(permission); if (failure) throw failure; if (catalogs[permission] instanceof Error) throw catalogs[permission]; if (catalogs[permission]) return catalogs[permission];
      return { brands: [{ id: 'a', name: 'Nord', status: 'active', privateData: 'secret' }], locations: [{ id: 'la', name: 'Station', brandId: 'a', isActive: true, privateData: 'secret' }] };
    } },
    '@/components/superadmin/access-denied-page': { AccessDeniedPage: () => React.createElement('p', null, 'Denied') },
    './printer-overview': { PrinterOverview: value => { props.push(value); return React.createElement('p', null, 'Printers'); } },
  };
  const code = ts.transpileModule(fs.readFileSync('src/app/superadmin/printers/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), mod, mod.exports);
  return { render: async () => renderToStaticMarkup(await mod.exports.default()), calls, props };
}
test('superuser printer page projects independent native view/create/edit metadata', async () => {
  const f = fixture(); assert.match(await f.render(), /Printers/);
  assert.deepEqual(f.calls, ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete']);
  assert.deepEqual(f.props, [{ createLocations: [{ id: 'la', brandId: 'a' }], editLocations: [{ id: 'la', brandId: 'a' }], deleteLocations: [{ id: 'la', brandId: 'a' }], brands: [{ id: 'a', name: 'Nord' }], locations: [{ id: 'la', name: 'Station', brandId: 'a' }] }]);
});
test('denied page does not read native location or printer data', async () => {
  for (const permissions of [['orderfly.catalog:view'], ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete'], ['orderfly.orders:view'], ['orderfly.stamp_cards:counter'], ['orderfly.catalog:edit']]) {
    const f = fixture({ permissions, superuser: false }); assert.match(await f.render(), /Denied/); assert.deepEqual(f.calls, []); assert.deepEqual(f.props, []);
  }
});
test('revoked catalog access renders denial without exposing selectors', async () => {
  const f = fixture({ failure: Object.assign(Error('PRIVATE_DETAIL'), { status: 403 }) });
  const html = await f.render(); assert.match(html, /Denied/); assert.doesNotMatch(html, /PRIVATE_DETAIL/); assert.deepEqual(f.props, []);
});
test('catalog outages show safe unavailable state, not an empty successful overview', async () => {
  const f = fixture({ failure: Error('PRIVATE_DETAIL') });
  const html = await f.render(); assert.match(html, /role="alert"/); assert.match(html, /kunne ikke indlæses/); assert.doesNotMatch(html, /PRIVATE_DETAIL/); assert.deepEqual(f.props, []);
});

test('write affordances use independent native create/edit scopes, never session permission union', async () => {
  const f = fixture({ permissions: ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete'], catalogs: {
    'orderfly.catalog:create': { brands: [], locations: [{ id: 'la', brandId: 'a', privateData: 'secret' }] },
    'orderfly.catalog:edit': { brands: [], locations: [{ id: 'lb', brandId: 'b', privateData: 'secret' }] },
  } });
  assert.match(await f.render(), /Printers/);
  assert.deepEqual(f.calls, ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete']);
  assert.deepEqual(f.props[0].createLocations, [{ id: 'la', brandId: 'a' }]);
  assert.deepEqual(f.props[0].editLocations, [{ id: 'lb', brandId: 'b' }]);
});
test('revoked write scope hides only that affordance without weakening view permission', async () => {
  const f = fixture({ permissions: ['orderfly.catalog:view', 'orderfly.catalog:create'], catalogs: {
    'orderfly.catalog:create': Object.assign(Error('PRIVATE_DETAIL'), { status: 403 }),
  } });
  assert.match(await f.render(), /Printers/);
  assert.deepEqual(f.props[0].createLocations, []); assert.deepEqual(f.props[0].editLocations, [{ id: 'la', brandId: 'a' }]);
});
test('superuser still resolves write scope using current native catalog', async () => {
  const f = fixture({ superuser: true, permissions: [] }); assert.match(await f.render(), /Printers/);
  assert.deepEqual(f.calls, ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete']);
});

test('retired merchant printer page never loads printer data', () => {
 const code=ts.transpileModule(fs.readFileSync('src/app/merchant/printers/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(name=>{assert.equal(name,'next/navigation');return {notFound:()=>{throw Error('NOT_FOUND');}};},mod,mod.exports);
 assert.throws(()=>mod.exports.default(),/NOT_FOUND/);
});

test('delete selector grants are independently resolved and revoked without hiding edit', async () => {
 const f = fixture({ catalogs: { 'orderfly.catalog:delete': Object.assign(Error('PRIVATE'), { status: 403 }) } });
 assert.match(await f.render(), /Printers/); assert.deepEqual(f.props[0].deleteLocations, []);
 assert.deepEqual(f.props[0].editLocations, [{ id: 'la', brandId: 'a' }]);
});
