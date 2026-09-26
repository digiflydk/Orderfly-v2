const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');
const { canNavigate } = loadTs('src/lib/access/navigation.ts');

test('mobile admin logo opens the overview for an orders-only administrator', () => {
  const code = ts.transpileModule(fs.readFileSync('src/components/superadmin/mobile-header.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const component = { exports: {} };
  const mocks = {
    '@/components/icons': { OrderFlyLogo: () => React.createElement('span') },
    '@/components/ui/sidebar': { SidebarTrigger: () => React.createElement('button') },
    'next/image': { default: () => React.createElement('img') },
    '@/components/superadmin/admin-link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) },
  };
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), component, component.exports);
  const markup = renderToStaticMarkup(React.createElement(component.exports.MobileHeader, { brandingSettings: {} }));
  const href = markup.match(/<a href="([^"]+)"/)?.[1];
  assert.equal(href, '/superadmin');
  assert.equal(canNavigate(href, { superuser: false, permissions: ['orderfly.orders:view'] }), true);
  assert.equal(canNavigate('/superadmin/dashboard', { superuser: false, permissions: ['orderfly.orders:view'] }), false);
});
