const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('../helpers/load-ts.cjs');
const {canNavigate,filterNavigation}=loadTs('src/lib/access/navigation.ts');

test('merchant navigation grants the redemption menu only to game viewers',()=>{
  const items=[{href:'/merchant',label:'Overblik'},{href:'/merchant/redeem',label:'Indløs kode'},{href:'/superadmin/products',label:'Produkter'}];
  const games={superuser:false,permissions:['orderfly.games:view']};
  assert.deepEqual(filterNavigation(items,games).map(item=>item.label),['Overblik','Indløs kode']);
  assert.equal(canNavigate('/merchant/redeem',{superuser:false,permissions:['orderfly.orders:view']}),false);
  assert.equal(canNavigate('/merchant',{superuser:false,permissions:[]}),false);
});

test('merchant overview lists only permitted work areas with scoped brand and location choices',async()=>{
  const session={superuser:false,permissions:['orderfly.games:view','orderfly.orders:view']};
  const scope={brands:[{id:'esmeralda',name:'Esmeralda'}],locations:[{id:'restaurant',name:'Restaurant',brandId:'esmeralda'}]};
  const mocks={
    '@/app/superadmin/_filters-data':{getFiltersData:async()=>scope},
    '@/lib/access/orderfly-session':{orderflySession:async()=>session},
    '@/lib/access/navigation':{canNavigate},
    '@/app/superadmin/overview-client':{AdminOverview:props=>React.createElement('div',{'data-brands':props.brands.map(row=>row.id).join(','),'data-locations':props.locations.map(row=>row.id).join(',')},props.destinations.map(row=>React.createElement('a',{key:row.href,href:row.href},row.label)))},
  };
  const code=ts.transpileModule(fs.readFileSync('src/app/merchant/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const overview={exports:{}};
  new Function('require','module','exports',code)(name=>mocks[name]||require(name),overview,overview.exports);
  const markup=renderToStaticMarkup(await overview.exports.default());
  assert.match(markup,/data-brands="esmeralda"/);
  assert.match(markup,/data-locations="restaurant"/);
  assert.match(markup,/href="\/merchant\/redeem"/);
  assert.match(markup,/href="\/superadmin\/sales\/orders"/);
  assert.doesNotMatch(markup,/href="\/superadmin\/products"/);
  assert.doesNotMatch(markup,/href="\/superadmin\/games"/);
});
