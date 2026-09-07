const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);return mod.exports;
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
test('filter reads start concurrently and preserve mapped results',async()=>{
 const started=[],resolve={};
 const api=load('src/app/superadmin/_filters-data.ts',{
  '@/lib/firebase':{db:{}},
  'firebase/firestore':{collection:(_,name)=>name,query:q=>q,orderBy:()=>null,getDocs:name=>{started.push(name);return new Promise(r=>resolve[name]=r);}},
 });
 const result=api.getFiltersData();
 assert.deepEqual(started,['brands','locations']);
 resolve.brands({docs:[{id:'b',data:()=>({name:'Brand'})}]});
 resolve.locations({docs:[{id:'l',data:()=>({name:'Location',brandId:'b'})}]});
 const data=await result;
 assert.deepEqual(data.brands,[{id:'b',name:'Brand'}]);assert.deepEqual(data.locations,[{id:'l',name:'Location',brandId:'b'}]);
});
