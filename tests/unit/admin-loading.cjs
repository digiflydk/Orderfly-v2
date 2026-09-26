const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name === '@/lib/server/firestore-compat' && mocks['firebase/firestore'] ? {...mocks['firebase/firestore'],db:mocks['@/lib/firebase']?.db} : name in mocks ?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
test('link feedback follows pending, retains navigation props and clears on completion',()=>{
 let pending=false,received;
 const feedback=load('src/components/superadmin/pending-feedback.tsx');
 const api=load('src/components/superadmin/admin-link.tsx',{
  './pending-feedback':feedback,
  'next/link':{__esModule:true,default:props=>{received=props;return React.createElement('a',{href:props.href},props.children);},useLinkStatus:()=>({pending})},
 });
 const onClick=()=>{},onNavigate=()=>{};
 const props={href:'/superadmin/upsells?q=x',target:'_blank',download:'export',replace:true,scroll:false,prefetch:false,onClick,onNavigate,children:'Open'};
 const render=()=>renderToStaticMarkup(React.createElement(api.default,props));
 assert.doesNotMatch(render(),/role="status"/);
 for(const key of Object.keys(props).filter(k=>k!=='children'))assert.equal(received[key],props[key]);
 pending=true;assert.match(render(),/role="status"/);assert.match(render(),/Indlæser/);
 pending=false;assert.doesNotMatch(render(),/role="status"/);
});
test('route fallback is visible without a timer and announces loading',()=>{
 const api=load('src/app/superadmin/loading.tsx',{'@/components/superadmin/pending-feedback':load('src/components/superadmin/pending-feedback.tsx')});
 const html=renderToStaticMarkup(React.createElement(api.default));
 assert.match(html,/aria-busy="true"/);assert.match(html,/role="status"/);
});
test('overview filter reads preserve the authorized selector union for delegated users',async()=>{
 const api=load('src/app/superadmin/_filters-data.ts',{
  '@/lib/access/native-catalog':{
   selectorCatalog:async()=>({superuser:false,brands:[{id:'b',name:'Brand'}],locations:[{id:'l',name:'Location',brandId:'b'}]}),
   nativeCatalog:async()=>{throw Error('delegated overview must not require analytics');},
  },
 });
 const data=await api.getFiltersData();
 assert.deepEqual(data.brands,[{id:'b',name:'Brand'}]);assert.deepEqual(data.locations,[{id:'l',name:'Location',brandId:'b'}]);
});
test('overview filter reads the complete native catalogue for platform superusers',async()=>{
 let permission;
 const api=load('src/app/superadmin/_filters-data.ts',{
  '@/lib/access/native-catalog':{
   selectorCatalog:async()=>({superuser:true,brands:[],locations:[]}),
   nativeCatalog:async value=>{permission=value;return {brands:[{id:'b',name:'Brand'}],locations:[{id:'l',name:'Location',brandId:'b'}]};},
  },
 });
 const data=await api.getFiltersData();assert.equal(permission,'orderfly.analytics:view');
 assert.deepEqual(data.brands,[{id:'b',name:'Brand'}]);assert.deepEqual(data.locations,[{id:'l',name:'Location',brandId:'b'}]);
});
