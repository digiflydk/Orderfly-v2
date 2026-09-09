const fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./load-ts.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const timestamp=()=>Timestamp.fromDate(new Date('2026-09-09T05:00:00Z'));
function fixture(){
 const product={id:'obsolete-id',brandId:'b',categoryId:'pizza',productName:'QA Pizza',price:84,isActive:true,sortOrder:0,
  locationIds:['l'],toppingGroupIds:['g'],allergenIds:['a'],createdAt:timestamp(),updatedAt:timestamp(),metadata:{importedAt:timestamp()}};
 const records=new Map([['products/p',product],['products/unsorted',{...product,id:'',productName:'QA Fries',price:45,sortOrder:undefined}],
  ['products/no-price',{...product,productName:'QA Missing price',price:undefined,sortOrder:1}]]);
 const snap=key=>({id:key.split('/')[1],exists:records.has(key),data:()=>({...records.get(key)})});
 const db={collection:name=>({get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(name+'/')).map(snap)}),doc:id=>({get:async()=>snap(name+'/'+id)})})};
 const products=loadTs('src/app/superadmin/products/actions.ts',{'server-only':{},'next/cache':{},'next/navigation':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 const brands=[{id:'b',name:'Esmeralda QA',currency:'DKK',createdAt:timestamp(),appearances:{updatedAt:timestamp()}},{id:'c',name:'CPH QA',currency:'DKK'}];
 const locations=[{id:'l',name:'QA Amager',brandId:'b',deliveryTypes:['pickup'],createdAt:timestamp()}];
 const categories=[{id:'pizza',categoryName:'QA Pizza category',locationIds:['l'],updatedAt:timestamp()}];
 const toppingGroups=[{id:'g',groupName:'QA Extras',locationIds:['l'],updatedAt:timestamp()}];
 const allergens=[{id:'a',allergenName:'QA Milk',updatedAt:timestamp()}];
 const mocks={
  '@/app/superadmin/brands/actions':{getBrands:async()=>brands},
  '@/app/superadmin/locations/actions':{getAllLocations:async()=>locations},
  '@/app/superadmin/categories/actions':{getCategories:async()=>categories},
  '@/app/superadmin/toppings/actions':{getToppingGroups:async()=>toppingGroups},
  '@/app/superadmin/allergens/actions':{getAllergens:async()=>allergens},
  '@/app/superadmin/products/actions':products,'./actions':products,
  '@/lib/upsell-serialization':loadTs('src/lib/upsell-serialization.ts'),
  '@/lib/runtime':{isAdminReady:()=>true},'@/components/ui/empty-state':()=>null,
  'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},
 };
 function loadPage(kind,client){
  const files={list:'page.tsx',edit:'edit/[productId]/page.tsx',new:'new/page.tsx'};
  const extra={'./client-page':{ProductsClientPage:client},'@/components/superadmin/product-form-page':{ProductFormPage:client}};
  const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/app/superadmin/products/'+files[kind],'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>name in extra?extra[name]:name in mocks?mocks[name]:require(name),mod,mod.exports);
  return mod.exports.default;
 }
 async function pageProps(kind,id='p'){
  const client=()=>null;client.fixtureClient=true;
  let element=await loadPage(kind,client)({params:Promise.resolve({productId:id})});
  while(typeof element.type==='function'&&!element.type.fixtureClient)element=await element.type(element.props);
  return element.props;
 }
 return {records,products,brands,locations,categories,toppingGroups,allergens,loadPage,pageProps};
}
module.exports={fixture,timestamp};
