const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');

test('native brand layout fetches only its brand and never forwards global marketing settings',async()=>{
 const brand={id:'brand-a',slug:'fixture',name:'Fixture'},reads=[];
 const mocks={
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'next/navigation':{notFound:()=>{throw Error('not found');}},
  '@/lib/data/brand-location':{getBrandBySlug:async slug=>{reads.push(slug);return slug==='fixture'?brand:null;}},
  '@/context/cart-context':{CartProvider:'Cart'},
  '@/context/analytics-context':{AnalyticsProvider:'Analytics'},
  './deliverymodalhost':{default:'Delivery'},
  '@/lib/next/resolve-props':{resolveParams:async p=>p},
  './layout-client':{BrandLayoutClient:'BrandLayoutClient'},
  '@/lib/runtime':{isAdminReady:()=>true},
  '@/components/brand-tracking':{BrandTracking:'Tracking'},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/layout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,`unexpected layout dependency: ${name}`);return mocks[name];},mod,mod.exports);
 const layout=mod.exports.default;
 const tree=await layout({params:Promise.resolve({brandSlug:'fixture'}),children:'content'});
 function find(node){if(node?.type==='BrandLayoutClient')return node;const children=node?.props?.children;for(const child of Array.isArray(children)?children:[children]){if(child&&typeof child==='object'){const found=find(child);if(found)return found;}}}
 assert.deepEqual(find(tree).props,{brand,children:'content'});
 assert.deepEqual(reads,['fixture']);
 await assert.rejects(layout({params:Promise.resolve({brandSlug:'unknown'}),children:'content'}),/not found/);
});
