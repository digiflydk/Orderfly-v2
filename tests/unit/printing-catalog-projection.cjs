const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const scope={orderId:'o1',brandId:'b1',locationId:'l1'};
const item=(patch={})=>({id:'p1',itemType:'product',name:'Pizza ÆØÅ',quantity:2,toppings:['Uden ost'],toppingIds:['t1'],unitPrice:99,totalPrice:198,...patch});
function fixture(){
 const rows=new Map([
  ['orders/o1',{id:'o1',brandId:'b1',locationId:'l1',deliveryType:'Pickup',productItems:[item()],customerName:'PRIVATE',customerDetails:{address:'SECRET'},psp:{checkoutSessionId:'SECRET'}}],
  ['brands/b1',{name:'Brand'}],['locations/l1',{brandId:'b1'}],
  ['products/p1',{id:'p1',brandId:'b1',categoryId:'c1',locationIds:['l1'],isActive:true,productName:'Current pizza name'}],
  ['categories/c1',{id:'c1',locationIds:['l1'],isActive:true,categoryName:'Pizza'}],
 ]);
 const reads=[],writes=[];
 const db={collection:name=>({doc:id=>({id,path:name+'/'+id})})};
 const transaction={get:async ref=>{reads.push(ref.path);const value=rows.get(ref.path);return {id:ref.id,exists:value!==undefined,data:()=>value};},set:()=>writes.push('set'),create:()=>writes.push('create'),update:()=>writes.push('update'),delete:()=>writes.push('delete')};
 const api=loadTs('src/lib/printing/catalog-line-projection.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 return {...api,rows,reads,writes,context:{db,transaction},order:()=>rows.get('orders/o1')};
}
const rejected=async(f,code)=>assert.rejects(f.projectNativePrintCatalog(f.context,scope),e=>e instanceof f.PrintCatalogProjectionError&&(!code||e.code===code)&&e.message===e.code);
test('native order/product/category reads project scoped historical display labels without private data or writes',async()=>{
 const f=fixture(),r=await f.projectNativePrintCatalog(f.context,scope);
 assert.deepEqual(r,{orderId:'o1',scope:{brandId:'b1',locationId:'l1'},deliveryType:'Pickup',lines:[{lineId:'line-0',productId:'p1',name:'Pizza ÆØÅ',quantity:2,modifiers:['Uden ost'],brandId:'b1',locationId:'l1',itemType:'product',categoryId:'c1'}],dispatchAuthorized:false});
 assert.deepEqual(f.reads,['orders/o1','brands/b1','locations/l1','products/p1','categories/c1']);assert.deepEqual(f.writes,[]);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET|price|customer|psp|payment|toppingIds/);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.scope)&&Object.isFrozen(r.lines)&&Object.isFrozen(r.lines[0])&&Object.isFrozen(r.lines[0].modifiers));
});
test('duplicate product rows keep distinct deterministic per-order line identities and independent modifiers',async()=>{
 const f=fixture();f.order().productItems=[item(),item({quantity:1,toppings:['Ekstra løg'],toppingIds:['t2']})];
 const first=await f.projectNativePrintCatalog(f.context,scope),second=await f.projectNativePrintCatalog(f.context,scope);
 assert.deepEqual(first,second);assert.deepEqual(first.lines.map(l=>[l.lineId,l.quantity,l.modifiers]),[['line-0',2,['Uden ost']],['line-1',1,['Ekstra løg']]]);
 assert.equal(f.reads.filter(x=>x==='products/p1').length,2,'one product read per invocation, not per row');
 f.order().productItems[0].toppings.push('Later change');assert.deepEqual(first.lines[0].modifiers,['Uden ost']);
});
test('actual location-owned category needs no brandId; optional conflicting legacy brand fails closed',async()=>{
 const f=fixture();assert.ok(await f.projectNativePrintCatalog(f.context,scope));
 f.rows.get('categories/c1').brandId='b1';assert.ok(await f.projectNativePrintCatalog(f.context,scope));
 f.rows.get('categories/c1').brandId='foreign';await rejected(f,'invalid_catalog');
});
test('product global location list is supported but category requires explicit location membership',async()=>{
 const f=fixture();f.rows.get('products/p1').locationIds=[];assert.ok(await f.projectNativePrintCatalog(f.context,scope));
 f.rows.get('categories/c1').locationIds=[];await rejected(f,'invalid_catalog');
});
test('foreign native order/location/product/category scope rejects the whole projection',async()=>{
 for(const [path,key,value]of [['orders/o1','brandId','foreign'],['orders/o1','locationId','other'],['locations/l1','brandId','foreign'],['products/p1','brandId','foreign'],['products/p1','locationIds',['other']],['categories/c1','locationIds',['other']]]){
  const f=fixture();f.rows.get(path)[key]=value;await rejected(f,'invalid_catalog');assert.deepEqual(f.writes,[]);
 }
});
test('missing/deleted/malformed native identities and inactive catalog records fail closed',async()=>{
 for(const path of ['orders/o1','brands/b1','locations/l1','products/p1','categories/c1']){
  let f=fixture();f.rows.delete(path);await rejected(f,'invalid_catalog');
  for(const patch of [{id:'foreign'},{deletedAt:'yesterday'},{isDeleted:true},{deleted:true},{isTestData:true},{deletedAt:false}]){
   f=fixture();Object.assign(f.rows.get(path),patch);await rejected(f,'invalid_catalog');
  }
 }
 for(const path of ['products/p1','categories/c1'])for(const value of [false,undefined,'true']){const f=fixture();f.rows.get(path).isActive=value;await rejected(f,'invalid_catalog');}
});
test('malformed location lists/duplicates/oversized arrays reject before reading their elements',async()=>{
 for(const path of ['products/p1','categories/c1'])for(const value of [undefined,null,'l1',['l1','l1'],['bad/path']]){
  const f=fixture();f.rows.get(path).locationIds=value;await rejected(f);
 }
 const f=fixture(),huge=new Array(1000000);Object.defineProperty(huge,'0',{get(){assert.fail('must not traverse oversized array');}});
 f.rows.get('products/p1').locationIds=huge;await rejected(f,'invalid_catalog');
});
test('combos and ambiguous combo selections reject the entire order before any product lookup',async()=>{
 for(const patch of [{itemType:'combo'},{comboSelections:[]},{comboSelections:[{products:[{id:'p1'}]}]}]){
  const f=fixture();f.order().productItems=[item(),item(patch)];await rejected(f,'combo_requires_projection');assert.ok(!f.reads.some(x=>x.startsWith('products/')));
 }
});
test('invalid order rows/quantities/note mappings fail without partial lines',async()=>{
 for(const patch of [{id:undefined},{id:'bad/path'},{itemType:undefined},{itemType:'other'},{quantity:0},{quantity:100},{quantity:1.5},{quantity:'1'},{name:''},{kitchenNote:'No defined canonical mapping'},{toppingIds:['t1','t2']},{toppingIds:['t1','t1'],toppings:['a','b']}]){
  const f=fixture();f.order().productItems=[item(patch)];await rejected(f);assert.deepEqual(f.writes,[]);
 }
 for(const patch of [{deliveryType:'Dining'},{productItems:[]},{productItems:null}]){const f=fixture();Object.assign(f.order(),patch);await rejected(f,'invalid_order');}
});
test('text rejects command/control/format injections and oversized values before regex or trimming',async()=>{
 for(const name of ['abc\ncut','\u001b@','name\u202e','\ud800',' ','x'.repeat(161)]){const f=fixture();f.order().productItems=[item({name})];await rejected(f,'invalid_order');}
 const f=fixture();f.order().productItems=[item({name:'x'.repeat(1000000)})];const trim=String.prototype.trim;
 String.prototype.trim=function(){assert.fail('oversized name must fail before text refinements');};try{await rejected(f,'invalid_order');}finally{String.prototype.trim=trim;}
});
test('line and modifier limits reject sparse million-entry arrays before element access',async()=>{
 for(const target of ['lines','modifiers']){const f=fixture(),huge=new Array(1000000);Object.defineProperty(huge,'0',{get(){assert.fail('must not read oversized element');}});
  if(target==='lines')f.order().productItems=huge;else f.order().productItems=[item({toppings:huge})];
  await rejected(f,'invalid_order');assert.ok(!f.reads.some(x=>x.startsWith('products/')));
 }
});
test('selected accessors reject without invocation and unrelated private fields are never touched',async()=>{
 const f=fixture();Object.defineProperty(f.order(),'customerDetails',{get(){assert.fail('private payload must not be touched');}});
 assert.ok(await f.projectNativePrintCatalog(f.context,scope));
 Object.defineProperty(f.order().productItems[0],'name',{get(){assert.fail('selected getter must not run');}});await rejected(f,'invalid_catalog');
});
test('aggregate output bound rejects the whole preparation without truncation',async()=>{
 const f=fixture();f.order().productItems=Array.from({length:50},()=>item({name:'n'.repeat(160),toppings:Array(8).fill('m'.repeat(160)),toppingIds:undefined}));
 await rejected(f,'projection_too_large');assert.deepEqual(f.writes,[]);
});
test('fresh invocation revalidates changed native category/order in the same supplied transaction',async()=>{
 const f=fixture();assert.ok(await f.projectNativePrintCatalog(f.context,scope));
 f.rows.get('categories/c1').locationIds=['other'];await rejected(f,'invalid_catalog');
 f.rows.get('categories/c1').locationIds=['l1'];f.order().productItems[0].quantity=7;
 const next=await f.projectNativePrintCatalog({...f.context},scope);assert.equal(next.lines[0].quantity,7);assert.deepEqual(f.writes,[]);
});
test('forged scope or foreign database contexts fail before reads',async()=>{
 const f=fixture();for(const input of [null,{}, {...scope,brandId:'bad/path'},{...scope,actor:'claimed'},{...scope,orderId:'x'.repeat(1000000)}])await assert.rejects(f.projectNativePrintCatalog(f.context,input));
 await assert.rejects(f.projectNativePrintCatalog({...f.context,db:{}},scope),e=>e.code==='invalid_reference');assert.deepEqual(f.reads,[]);
});
test('projected snapshot feeds the actual routing preview using native category identity, not a cart claim',async()=>{
 const f=fixture();f.order().productItems[0].categoryId='client-wrong';
 const r=await f.projectNativePrintCatalog(f.context,scope);
 const {previewPrinterRouting}=loadTs('src/lib/printing/routing-preview.ts',{'server-only':{}});
 const preview=previewPrinterRouting({scope:r.scope,deliveryType:r.deliveryType,lines:r.lines,
  printers:[{configuration:{id:'pr1',brandId:'b1',locationId:'l1',name:'Kitchen',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state:'paused',paperWidthMm:80},deleted:false}],
  rules:[{id:'rule1',brandId:'b1',locationId:'l1',printerId:'pr1',match:{type:'category',id:'c1'},effect:'include'}]});
 assert.equal(preview.targets.length,1);assert.equal(preview.targets[0].lines[0].categoryId,'c1');assert.equal(preview.targets[0].dispatchAuthorized,false);
});
