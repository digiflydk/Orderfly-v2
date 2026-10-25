const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const file='src/app/superadmin/printers/[brandId]/[locationId]/[printerId]/[action]/page.tsx';
const item={configuration:{id:'p',brandId:'b',locationId:'l',name:'Kitchen',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state:'active',paperWidthMm:80},revision:5};
function fixture(options={}){
 const calls=[],props=[];
 const catalog={brands:[{id:'b',name:'Brand',secret:'PRIVATE'}],locations:[{id:'l',brandId:'b',name:'Location',secret:'PRIVATE'}]};
 const mocks={
  'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},
  'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)},
  '@/lib/access/orderfly-session':{orderflySession:async()=>({superuser:options.superuser!==false,actorId:'actor'})},
  '@/lib/access/navigation':{canNavigate:()=>true},
  '@/lib/access/native-catalog':{nativeCatalog:async permission=>{calls.push(permission);if(options.failure)throw options.failure;return options.catalogs?.[permission]||catalog;}},
  '@/lib/printing/reads':{readPrinterConfigurations:async input=>{calls.push(input);if(options.readFailure)throw options.readFailure;return{item:options.item||item};}},
  '@/components/superadmin/access-denied-page':{AccessDeniedPage:()=>React.createElement('p',null,'Denied')},
  '../../../../printer-action-page':{PrinterActionPage:arg=>{props.push(arg);return React.createElement('p',null,'Action page');}},
 };
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',code)(name=>mocks[name]||require(name),mod,mod.exports);
 return{calls,props,render:async(patch={})=>renderToStaticMarkup(await mod.exports.default({params:Promise.resolve({brandId:'b',locationId:'l',printerId:'p',action:'edit',...patch})}))};
}
test('dedicated action GETs read authorized current revision, use independent edit/delete grants and never mutate',async()=>{
 for(const action of ['edit','deactivate','delete']){
  const f=fixture();assert.match(await f.render({action}),/Action page/);
  assert.deepEqual(f.calls,['orderfly.catalog:view',action==='delete'?'orderfly.catalog:delete':'orderfly.catalog:edit',{brandId:'b',locationId:'l',printerId:'p'}]);
  assert.deepEqual(f.props,[{action,item,brandName:'Brand',locationName:'Location'}]);
  assert.doesNotMatch(JSON.stringify(f.props),/PRIVATE/);
 }
});
test('merchant, forged route and cross-brand/write-revoked locations cannot expose printer data',async()=>{
 const denied=fixture({superuser:false});assert.match(await denied.render(),/Denied/);assert.deepEqual(denied.calls,[]);
 for(const patch of [{action:'resume'},{action:'anything'},{brandId:'../b'},{printerId:'p/x'},{locationId:''}]){const f=fixture();await assert.rejects(f.render(patch),/NOT_FOUND/);assert.deepEqual(f.calls,[]);}
 for(const action of ['edit','delete']){
  const permission=action==='delete'?'orderfly.catalog:delete':'orderfly.catalog:edit';
  const f=fixture({catalogs:{[permission]:{brands:[],locations:[{id:'l',brandId:'foreign'}]}}});assert.match(await f.render({action}),/Denied/);assert.equal(f.calls.some(x=>typeof x==='object'),false);
 }
 const f=fixture();assert.match(await f.render({brandId:'foreign'}),/Denied/);assert.equal(f.calls.some(x=>typeof x==='object'),false);
});
test('deleted/corrupt/foreign responses and outages expose safe failure with return navigation',async()=>{
 for(const options of [{readFailure:Object.assign(Error('PRIVATE'),{status:404})},{readFailure:Error('PRIVATE')},{item:{...item,configuration:{...item.configuration,brandId:'foreign'}}}]){
  const f=fixture(options),html=await f.render();assert.match(html,/role="alert"/);assert.match(html,/Tilbage til printeroversigten/);assert.doesNotMatch(html,/PRIVATE|Action page/);assert.deepEqual(f.props,[]);
 }
 for(const status of [401,403]){const f=fixture({readFailure:Object.assign(Error('PRIVATE'),{status})});assert.match(await f.render(),/Denied/);}
});
