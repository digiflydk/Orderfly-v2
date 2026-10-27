const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const schemas=loadTs('src/lib/superadmin/topping-catalog-schema.ts');
function fixture(){
 const identity={provider:'firebase',subject:'owner'},principal=loadTs('src/lib/access/authority.ts',{'server-only':{}}).principalKey(identity);
 const rows=new Map([
 ['brands/b',{}],['brands/c',{}],['locations/l',{brandId:'b',isActive:true}],['locations/other',{brandId:'c',isActive:true}],
 ['topping_groups/g',{groupName:'Extras',locationIds:['l'],minSelection:0,maxSelection:0}],
 ['topping_groups/r',{groupName:'Without',locationIds:['l'],kind:'removal',minSelection:0,maxSelection:0}],
 ['toppings/t',{groupId:'g',toppingName:'Cheese',price:5,isActive:true,isDefault:false,maxQuantity:3,locationIds:['l']}],
 ['products/p',{brandId:'b',productName:'Dip',price:10,isActive:true,locationIds:['l']}],
 ['platformAdminControl/access-v1',{principals:[{id:principal,active:true}],companies:[{id:'co',active:true,locationIds:['l'],orderflyBrandIds:['b']}],roles:[{id:'owner',name:'Owner',companyId:'co',kind:'company_user',active:true,permissions:['orderfly.catalog:view','orderfly.catalog:edit','orderfly.catalog:create','orderfly.catalog:delete']}],memberships:[{id:'m',principalId:principal,companyId:'co',locationIds:null,roleIds:['owner'],active:true}]}]
 ]);let seq=0;const writes=[];
 const snapshot=path=>({id:path.split('/')[1],ref:{path},exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
 const query=(collection,filters=[],limit=Infinity)=>({
  where:(field,op,value)=>query(collection,[...filters,[field,op,value]],limit),limit:n=>query(collection,filters,n),
  doc:(id='copy'+(++seq))=>({path:collection+'/'+id,id,get:async()=>snapshot(collection+'/'+id)}),
  get:async()=>{const docs=[...rows.keys()].filter(path=>path.startsWith(collection+'/')&&filters.every(([field,op,value])=>op==='array-contains'?rows.get(path)[field]?.includes(value):rows.get(path)[field]===value)).slice(0,limit).map(snapshot);return{docs,size:docs.length,empty:!docs.length};}
 });
 const db={collection:query,runTransaction:async fn=>{const staged=[];const result=await fn({get:async ref=>ref.path?snapshot(ref.path):ref.get(),set:(ref,data)=>staged.push([ref.path,data]),create:(ref,data)=>{if(rows.has(ref.path))throw Error('exists');staged.push([ref.path,data]);},delete:ref=>staged.push([ref.path,null])});for(const [path,data]of staged){writes.push(path);if(data)rows.set(path,data);else rows.delete(path);}return result;}};
 const session={verifiedOrderflyIdentity:async()=>identity};
 const api=loadTs('src/app/superadmin/toppings/actions.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':session,'./orderfly-session':session,'@/app/superadmin/products/actions':{getProducts:async()=>[]},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT')}}});
 const form=(extra={})=>{const data=new FormData();for(const [key,value]of Object.entries({id:'t',groupId:'g',locationIds:['l'],toppingName:'Cheese',price:5,isActive:'on',maxQuantity:3,...extra})){for(const v of Array.isArray(value)?value:[value])if(v!==undefined)data.append(key,String(v));}return data;};
 return{rows,writes,api,form};
}
test('catalog rejects fractional limits, nonfinite prices, invalid IDs and unknown override fields',()=>{
 for(const change of [{minSelection:1.5},{maxSelection:Infinity},{kind:'removal',minSelection:1}])assert.equal(schemas.toppingGroupSchema.safeParse({groupName:'Extras',locationIds:['l'],minSelection:0,maxSelection:0,...change}).success,false);
 assert.equal(schemas.toppingGroupSchema.safeParse({groupName:'Extras',locationIds:['l'],minSelection:2,maxSelection:3,selectionMode:'single'}).success,true);
 assert.equal(schemas.toppingOverridesSchema.safeParse({t:{price:Infinity}}).success,false);
 assert.equal(schemas.toppingOverridesSchema.safeParse({t:{defaultQuantity:1.5}}).success,false);
 assert.equal(schemas.toppingOverridesSchema.safeParse({'bad/id':{price:1}}).success,false);
 assert.equal(schemas.toppingOverridesSchema.safeParse({t:{brandId:'other'}}).success,false);
});
test('zero price override is distinct from inheritance; removal/default/availability and scope validation',()=>{
 const groups=[{id:'g'}],options=[{id:'t',groupId:'g',price:20,maxQuantity:3,locationIds:['l']}];
 assert.equal(schemas.validateToppingOverrides({t:{price:0,defaultQuantity:2}},['g'],groups,options,['l']),null);
 for(const value of [{t:{defaultQuantity:4}},{t:{isAvailable:false,isDefault:true}}])assert.ok(schemas.validateToppingOverrides(value,['g'],groups,options,['l']));
 assert.ok(schemas.validateToppingOverrides({t:{}},[],groups,options,['l']));
 assert.ok(schemas.validateToppingOverrides({t:{}},['g'],groups,options,['other']));
 assert.ok(schemas.validateToppingOverrides({t:{price:1}},['g'],[{id:'g',kind:'removal'}],options,['l']));
});
test('cannot delete used group or option; query and writes share transaction',async()=>{
 for(const method of ['deleteTopping','deleteToppingGroup']){const f=fixture();f.rows.set('products/parent',{toppingGroupIds:['g'],brandId:'b',locationIds:['l']});const result=await f.api[method](method==='deleteTopping'?'t':'g');assert.equal(result.error,true);assert.match(result.message,/bruges/);assert.deepEqual(f.writes,[]);}
});
test('unreferenced group deletes its options atomically',async()=>{
 const f=fixture(),result=await f.api.deleteToppingGroup('g');assert.equal(result.error,false);assert.equal(f.rows.has('topping_groups/g'),false);assert.equal(f.rows.has('toppings/t'),false);assert.equal(f.writes.length,2);
});
test('copy allocates independent IDs and refuses foreign child scope without partial writes',async()=>{
 const f=fixture(),result=await f.api.duplicateToppingGroup('g');assert.equal(result.error,false,JSON.stringify(result));assert.notEqual(result.id,'g');const copies=[...f.rows.values()].filter(row=>row.groupId===result.id);assert.equal(copies.length,1);assert.notEqual(copies[0].id,'t');assert.equal(copies[0].maxQuantity,3);
 const bad=fixture();bad.rows.get('toppings/t').locationIds=['other'];assert.equal((await bad.api.duplicateToppingGroup('g')).error,true);assert.deepEqual(bad.writes,[]);
});
test('real current permission prevents deletion and duplication',async()=>{
 for(const method of ['deleteToppingGroup','duplicateToppingGroup']){const f=fixture();f.rows.get('platformAdminControl/access-v1').memberships[0].active=false;assert.equal((await f.api[method]('g')).error,true);assert.deepEqual(f.writes,[]);}
});
test('linked native product validates brand, location, active state and nesting',async()=>{
 const good=fixture();await assert.rejects(good.api.createOrUpdateTopping(null,good.form({productId:'p'})),/REDIRECT/);assert.equal(good.rows.get('toppings/t').productId,'p');
 for(const patch of [{brandId:'c'},{locationIds:undefined},{locationIds:['other']},{isActive:false},{toppingGroupIds:['g']},{isTestData:true}]){const f=fixture();Object.assign(f.rows.get('products/p'),patch);const result=await f.api.createOrUpdateTopping(null,f.form({productId:'p'}));assert.equal(result.error,true);assert.deepEqual(f.writes,[]);}
});
test('removal options reject charging, defaults, repetition and product references',async()=>{
 for(const patch of [{price:1},{isDefault:'on'},{maxQuantity:2},{productId:'p'}]){const f=fixture();const result=await f.api.createOrUpdateTopping(null,f.form({groupId:'r',price:0,maxQuantity:1,...patch}));assert.equal(result.error,true);assert.deepEqual(f.writes,[]);}
});

test('product saves preserve ordered groups and explicit zero overrides, with atomic rejection of detached options', async () => {
 const {fixture, form}=require('../helpers/product-save-fixture.cjs');
 const f=fixture();
 f.records.set('toppings/extra',{groupId:'g',locationIds:['l'],price:5,maxQuantity:3,isDefault:true});
 const overrides={extra:{price:0,isDefault:false,defaultQuantity:2}};
 const result=await f.actions.createOrUpdateProduct(null,form({toppingGroupIds:['g2','g'],toppingOverrides:JSON.stringify(overrides)}));
 assert.equal(result.ok,true,JSON.stringify(result));
 const saved=await f.actions.getProductById(result.id);
 assert.deepEqual(saved.toppingGroupIds,['g2','g']);assert.deepEqual(saved.toppingOverrides,overrides);
 const before=f.writes.length;
 const rejected=await f.actions.createOrUpdateProduct(null,form({id:result.id,creationKey:undefined,toppingGroupIds:['g2'],toppingOverrides:JSON.stringify(overrides)}));
 assert.equal(rejected.ok,false);assert.equal(f.writes.length,before);
 const cleared=await f.actions.createOrUpdateProduct(null,form({id:result.id,creationKey:undefined,toppingGroupIds:['g2'],toppingOverrides:'{}'}));
 assert.equal(cleared.ok,true,JSON.stringify(cleared));assert.deepEqual(f.records.get('products/'+result.id).toppingOverrides,{});
});

test('product copying validates override option scope at the target location', async () => {
 const {fixture}=require('../helpers/product-save-fixture.cjs');const f=fixture();
 const original=f.records.get('products/hellerup');
 f.records.set('products/hellerup',{...original,toppingGroupIds:['g2'],toppingOverrides:{extra:{price:0}}});
 f.records.set('toppings/extra',{groupId:'g2',locationIds:['l2'],price:5,maxQuantity:1});
 const blocked=await f.actions.duplicateProducts({productIds:['hellerup'],targetBrandId:'b',targetLocationIds:['l']});
 assert.equal(blocked.success,false);assert.equal(f.writes.length,0);
 const copied=await f.actions.duplicateProducts({productIds:['hellerup'],targetBrandId:'b',targetLocationIds:['l2']});
 assert.equal(copied.success,true,JSON.stringify(copied));assert.equal(f.writes.length,1);
 assert.deepEqual(f.records.get(f.writes[0]).toppingOverrides,{extra:{price:0}});
});

test('native product cannot transfer brand while referenced by an option',async()=>{
 const {fixture,form}=require('../helpers/product-save-fixture.cjs');const f=fixture();
 f.records.set('toppings/link',{productId:'hellerup',groupId:'g2',locationIds:['l2']});
 const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b',brandId:'c',categoryId:'foreign',locationIds:['foreign']}));
 assert.equal(result.ok,false);assert.match(result.error.detail,/bruges som tilvalg/);assert.equal(f.writes.length,0);
});

test('linked options reject price overrides while preserving other product settings',()=>{
 const groups=[{id:'g'}],options=[{id:'t',groupId:'g',productId:'native',price:20,maxQuantity:3,locationIds:['l']}];
 for(const price of [0,7,20]) assert.match(schemas.validateToppingOverrides({t:{price}},['g'],groups,options,['l']),/aktuelle pris/);
 for(const override of [{isDefault:true,defaultQuantity:2},{isAvailable:false},{isDefault:false}]) assert.equal(schemas.validateToppingOverrides({t:override},['g'],groups,options,['l']),null);
});
test('product save rejects linked price override atomically',async()=>{
 const {fixture,form}=require('../helpers/product-save-fixture.cjs');const f=fixture();
 f.records.set('toppings/extra',{groupId:'g',locationIds:['l'],productId:'native',price:5,maxQuantity:3});
 const before=f.writes.length;
 const result=await f.actions.createOrUpdateProduct(null,form({toppingGroupIds:['g'],toppingOverrides:JSON.stringify({extra:{price:0}})}));
 assert.equal(result.ok,false);assert.equal(f.writes.length,before);
});
