const fs = require('node:fs');
const ts = require('typescript');
const { loadTs } = require('./load-ts.cjs');
const pure = loadTs('src/lib/storefront-home-screen.ts');
const brand = { id: 'brand-a', slug: 'esmeralda', name: 'Esmeralda Pizza', status: 'active', logoUrl: '/api/storefront-image?collection=brands&id=brand-a&field=logoUrl', appearances: { colors: { background: '#ffffff' } } };

function fixture({ currentBrand = brand, stored, host = 'esmeralda.orderfly.dk', ready = true } = {}) {
  const reads = [];
  const mocks = {
    'server-only': {},
    sharp: {default:require('sharp')},
    '@/lib/data/brand-location': { getBrandBySlug: async slug => { reads.push(['slug', slug]); return currentBrand; } },
    '@/lib/firebase-admin': { getAdminDb: () => ({ collection: collection => ({ doc: id => ({ get: async () => { reads.push([collection, id]); return { data: () => stored ?? { ...brand, logoUrl: null } }; } }) }) }) },
  };
  const server = loadTs('src/lib/server/storefront-home-screen.ts', mocks);
  function metadata(file, additional = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const known = {
      ...mocks,
      '@/lib/runtime': { isAdminReady: () => ready },
      'next/headers': { headers: async () => new Headers({host}) },
      '@/lib/next/resolve-props': { resolveParams: async params => params },
      '@/lib/storefront-home-screen': pure,
      '@/lib/server/storefront-home-screen': server,
      ...additional,
    };
    new Function('require','module','exports',code)(name => known[name] ?? {},module,module.exports);
    return module.exports;
  }
  const brandMetadata = metadata('src/app/[brandSlug]/layout.tsx').generateMetadata;
  return {
    reads, pure, server,
    metadata: brandMetadata,
    esmeraldaMetadata: metadata('src/app/esmeralda/page.tsx', {
      '@/app/[brandSlug]/layout': { generateMetadata: brandMetadata },
    }).generateMetadata,
    clubMetadata: metadata('src/app/[brandSlug]/club/layout.tsx', {'./data': {
      loadPortal: async () => ({program:{name:'Esmeralda Club'}}),
      portalBase: async () => host === 'orderfly.dk' ? '/esmeralda/club' : '/club',
    }}).generateMetadata,
    manifest: loadTs('src/app/api/storefront/brands/[brandSlug]/manifest.webmanifest/route.ts', mocks).GET,
    icon: loadTs('src/app/api/storefront/brands/[brandSlug]/icon/[size]/route.ts', mocks).GET,
  };
}

// Use Next's actual metadata inheritance, including file-based root icons.
const Module = require('node:module');
const originalLoad = Module._load;
let accumulateMetadata;
try {
  Module._load = function(name, ...args) {
    if (name === 'server-only') return {};
    if (name === 'react') return {...originalLoad.call(this,name,...args),cache:fn=>fn};
    return originalLoad.call(this,name,...args);
  };
  ({accumulateMetadata} = require('next/dist/lib/metadata/resolve-metadata'));
} finally { Module._load = originalLoad; }
async function resolvedMetadata(parent, child) {
  const items = [
    [{title:'Orderfly Studio',description:'Dev baseline'}, {icon:[{url:'/icon.png',type:'image/png',sizes:'32x32'}]}, null],
    ...(parent ? [[parent,null,null]] : []),
    ...(child ? [[child,null,null]] : []),
    [null,null,null],
  ];
  return accumulateMetadata('/[brandSlug]', items, '/esmeralda', {trailingSlash:false,isStaticMetadataRouteFile:false});
}
module.exports = { fixture, brand, resolvedMetadata };
