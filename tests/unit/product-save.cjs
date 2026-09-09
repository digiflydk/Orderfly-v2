const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture,form,image}=require('../helpers/product-save-fixture.cjs');
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='orderfly-test.invalid';
for(const format of ['jpeg','png','avif'])test(`actual ${format} bytes persist with product values and one location`,async()=>{
 const f=fixture(),bytes=await image(format),data=form({imageUrl:new File([bytes],`water.${format}`,{type:`image/${format}`})});
 const result=await f.actions.createOrUpdateProduct(null,data);assert.equal(result.ok,true,JSON.stringify(result));
 const product=await f.actions.getProductById(result.id);
 assert.equal(product.price,20);assert.equal(product.priceDelivery,20);assert.equal(product.brandId,'b');assert.equal(product.categoryId,'water');assert.deepEqual(product.locationIds,['l']);
 assert.match(product.imageUrl,/^https:\/\/firebasestorage.googleapis.com\//);assert.doesNotMatch(product.imageUrl,/picsum|dully/i);
 const url=new URL(product.imageUrl),object=f.objects.get(decodeURIComponent(url.pathname.split('/o/')[1]));
 assert.deepEqual(object.bytes,bytes);assert.equal(object.options.metadata.contentType,`image/${format}`);
 assert.deepEqual(f.writes,['products/'+result.id]);assert.equal(f.records.get('products/hellerup').price,50);
});
for(const count of [0,1,2])test(`zero/one/multiple selections (${count}) remain arrays`,async()=>{
 const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form({locationIds:['l','l2'].slice(0,count),toppingGroupIds:['g','g2'].slice(0,count),allergenIds:['a','a2'].slice(0,count)}));
 assert.equal(result.ok,true,JSON.stringify(result));const saved=await f.actions.getProductById(result.id);
 for(const key of ['locationIds','toppingGroupIds','allergenIds']){assert.ok(Array.isArray(saved[key]));assert.equal(saved[key].length,count);}
});
test('all-location products require a category available at every brand location',async()=>{
 const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form({locationIds:[],categoryId:'amager-only'}));
 assert.equal(result.ok,false);assert.match(result.error.detail,/category must belong/);assert.equal(f.writes.length,0);
});
test('bracket arrays, duplicates and editing without a new image preserve intended values',async()=>{
 const f=fixture(),data=form({id:'hellerup',locationIds:[],creationKey:undefined,'locationIds[]':['l2','l2'],'allergenIds[]':['a'],toppingGroupIds:['g2'],isActive:'false',imageUrl:new File([],'',{type:'application/octet-stream'})});
 const result=await f.actions.createOrUpdateProduct(null,data);assert.equal(result.ok,true,JSON.stringify(result));
 const saved=await f.actions.getProductById('hellerup');assert.deepEqual(saved.locationIds,['l2']);assert.equal(saved.imageUrl,'https://existing.example/keep.jpg');assert.equal(saved.isActive,false);assert.equal(f.objects.size,0);
});
test('clearing an existing delivery price removes the override',async()=>{
 const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',creationKey:undefined,locationIds:['l2'],priceDelivery:''}));
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(Object.hasOwn(f.records.get('products/hellerup'),'priceDelivery'),false);
});
for(const overrides of [{brandId:''},{brandId:'missing'},{locationIds:['foreign']},{categoryId:'foreign'},{toppingGroupIds:['foreign']},{allergenIds:['missing']},{id:'hellerup',brandId:'c'},{price:'-1'},{imageUrl:'https://picsum.photos/fake.jpg'}])test(`reject invalid/scoped input ${JSON.stringify(overrides)}`,async()=>{
 const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form(overrides));assert.equal(result.ok,false);assert.equal(f.writes.length,0);assert.equal(f.objects.size,0);
});
test('upload failure preserves stored record; retry creates once even after lost acknowledgement',async()=>{
 const f=fixture(),bytes=await image();const data=form({imageUrl:new File([bytes],'water.jpg',{type:'image/jpeg'})});
 f.failure.upload=true;const failed=await f.actions.createOrUpdateProduct(null,data);assert.equal(failed.ok,false);assert.match(failed.error.detail,/Image upload failed/);assert.equal(f.writes.length,0);
 f.failure.upload=false;f.failure.afterWrite=true;const saved=await f.actions.createOrUpdateProduct(null,data);assert.equal(saved.ok,true,JSON.stringify(saved));
 const retry=await f.actions.createOrUpdateProduct(null,data);assert.equal(retry.id,saved.id);assert.equal(f.writes.length,1);assert.equal(f.objects.size,1);
});
test('a creation key cannot silently accept a changed retry payload',async()=>{
 const f=fixture(),key=randomUUID(),data=form({creationKey:key});f.failure.afterWrite=true;
 const saved=await f.actions.createOrUpdateProduct(null,data);assert.equal(saved.ok,true,JSON.stringify(saved));
 const changed=await f.actions.createOrUpdateProduct(null,form({creationKey:key,productName:'Changed after lost response'}));
 assert.equal(changed.ok,false);assert.match(changed.error.detail,/different values/);assert.equal(f.writes.length,1);
});
test('permission, write and replacement-upload failures never change Hellerup',async()=>{
 for(const failure of ['permission','write','upload']){
  const f=fixture(),old={...f.records.get('products/hellerup')};f.failure[failure]=true;
  const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',locationIds:['l2'],imageUrl:new File([await image()],'water.jpg',{type:'image/jpeg'})}));
  assert.equal(result.ok,false);assert.deepEqual(f.records.get('products/hellerup'),old);
 }
});
test('image validation rejects mismatched, corrupt, unsupported and oversized content',async()=>{
 const f=fixture();
 for(const file of [new File(['not an image'],'fake.jpg',{type:'image/jpeg'}),new File([await image('png')],'fake.jpg',{type:'image/jpeg'}),new File(['<svg/>'],'fake.svg',{type:'image/svg+xml'}),new File([new Uint8Array(5*1024*1024+1)],'big.jpg',{type:'image/jpeg'})]){
  await assert.rejects(()=>f.upload(file,'b','p'));assert.equal(f.objects.size,0);
 }
});

test('successful upload does not depend on the Firebase metadata read endpoint',async()=>{
 const f=fixture(),bytes=await image();const url=await f.upload(new File([bytes],'image.jpg',{type:'image/jpeg'}),'b','p');
 assert.deepEqual(f.storageCalls,[{operation:'save',bucket:'orderfly-test.invalid'}]);
 const parsed=new URL(url),object=f.objects.get(decodeURIComponent(parsed.pathname.split('/o/')[1]));
 assert.equal(parsed.searchParams.get('token'),object.options.metadata.metadata.firebaseStorageDownloadTokens);
 assert.deepEqual(object.bytes,bytes);
});
test('runtime bucket overrides build-time bucket and accepts Firebase gs syntax',async()=>{
 const f=fixture();process.env.FIREBASE_STORAGE_BUCKET=' gs://orderfly-test.firebasestorage.app/ ';
 try{await f.upload(new File([await image()],'image.jpg',{type:'image/jpeg'}),'b','p');assert.equal(f.storageCalls[0].bucket,'orderfly-test.firebasestorage.app');}
 finally{delete process.env.FIREBASE_STORAGE_BUCKET;}
});
test('invalid, missing and different-project bucket fail before storage writes',async()=>{
 const f=fixture(),file=new File([await image()],'image.jpg',{type:'image/jpeg'});
 for(const [setting,code]of [['','image/storage-not-configured'],['https://example.com/bucket','image/invalid-bucket'],['hosting-project.appspot.com','image/wrong-project']]){
  process.env.FIREBASE_STORAGE_BUCKET=setting;
  try{await assert.rejects(()=>f.upload(file,'b','p'),error=>error.code===code);assert.equal(f.storageCalls.length,0);}
  finally{delete process.env.FIREBASE_STORAGE_BUCKET;}
 }
});
test('storage errors identify access, missing bucket and credentials without exposing SDK request data',async()=>{
 for(const [code,expected]of [[403,'image/storage-permission-denied'],[404,'image/storage-not-found'],[401,'image/storage-credentials'],[503,'image/storage-unavailable']]){
  const f=fixture(),logs=[],oldLog=console.error;
  f.failure.upload=Object.assign(Error('Authorization: Bearer synthetic-secret'),{code,request:{headers:{Authorization:'synthetic-secret'}}});
  console.error=(...args)=>logs.push(args);
  try{
   const result=await f.actions.createOrUpdateProduct(null,form({imageUrl:new File([await image()],'image.jpg',{type:'image/jpeg'})}));
   assert.equal(result.ok,false);assert.equal(result.error.code,expected);assert.equal(f.writes.length,0);
   assert.doesNotMatch(JSON.stringify([logs,result]),/synthetic-secret|synthetic-private-key/);
   const diagnostic=logs.find(entry=>entry[0]==='[products.image] Upload failed')[1];
   assert.equal(diagnostic.credentialProject,'orderfly-test');assert.equal(diagnostic.serviceAccount,'qa-uploader@orderfly-test.iam.gserviceaccount.com');
   assert.doesNotMatch(JSON.stringify(result),/qa-uploader/);
  }finally{console.error=oldLog;}
 }
});
test('explicit existing-product brand change validates target and keeps ID, price and image',async()=>{
 const f=fixture(),before={...f.records.get('products/hellerup')};
 const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b',brandId:'c',categoryId:'foreign',locationIds:['foreign'],toppingGroupIds:['foreign'],price:before.price,priceDelivery:before.priceDelivery}));
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.id,'hellerup');
 const product=await f.actions.getProductById('hellerup');
 assert.equal(product.brandId,'c');assert.equal(product.categoryId,'foreign');assert.deepEqual(product.locationIds,['foreign']);assert.deepEqual(product.toppingGroupIds,['foreign']);assert.equal(product.price,50);assert.equal(product.imageUrl,before.imageUrl);assert.equal(f.objects.size,0);
});
test('brand change rejects missing or stale source and references from former brand',async()=>{
 const cases=[{originalBrandId:undefined},{originalBrandId:'c'},{locationIds:['l']},{categoryId:'water'},{toppingGroupIds:['g']}];
 for(const extra of cases){
  const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b',brandId:'c',categoryId:'foreign',locationIds:['foreign'],...extra}));
  assert.equal(result.ok,false,JSON.stringify(extra));assert.equal(f.writes.length,0);assert.equal(f.records.get('products/hellerup').brandId,'b');
 }
});
test('stale editor cannot undo a previously saved brand move',async()=>{
 const f=fixture();f.records.get('products/hellerup').brandId='c';
 const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b'}));
 assert.equal(result.ok,false);assert.match(result.error.detail,/brand has changed/);assert.equal(f.writes.length,0);
});
test('concurrent edit during upload cannot overwrite a later brand change',async()=>{
 const f=fixture();f.failure.beforeUpdate=(records,key)=>records.set(key,{...records.get(key),brandId:'c',productName:'Saved by another admin'});
 const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b',imageUrl:new File([await image()],'image.jpg',{type:'image/jpeg'})}));
 assert.equal(result.ok,false);assert.equal(f.writes.length,0);assert.equal(f.records.get('products/hellerup').brandId,'c');assert.equal(f.records.get('products/hellerup').productName,'Saved by another admin');
});

test('explicit storage project supports the approved separation from the data credential',async()=>{
 const f=fixture();
 process.env.FIREBASE_STORAGE_PROJECT_ID='studio-2819118380-ae26c';
 process.env.FIREBASE_STORAGE_BUCKET='studio-2819118380-ae26c.firebasestorage.app';
 try{
  const result=await f.actions.createOrUpdateProduct(null,form({imageUrl:new File([await image()],'image.jpg',{type:'image/jpeg'})}));
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.storageCalls[0].bucket,'studio-2819118380-ae26c.firebasestorage.app');
  assert.equal(f.records.get('products/'+result.id).brandId,'b');assert.equal(f.records.get('products/hellerup').price,50);
 }finally{delete process.env.FIREBASE_STORAGE_PROJECT_ID;delete process.env.FIREBASE_STORAGE_BUCKET;}
});
test('explicit storage project still rejects a bucket from an unrelated project',async()=>{
 const f=fixture();process.env.FIREBASE_STORAGE_PROJECT_ID='studio-2819118380-ae26c';process.env.FIREBASE_STORAGE_BUCKET='hosting-project.firebasestorage.app';
 try{await assert.rejects(async()=>f.upload(new File([await image()],'image.jpg',{type:'image/jpeg'}),'b','p'),error=>error.code==='image/wrong-project');assert.equal(f.storageCalls.length,0);}
 finally{delete process.env.FIREBASE_STORAGE_PROJECT_ID;delete process.env.FIREBASE_STORAGE_BUCKET;}
});

const moveForm=extra=>form({id:'hellerup',originalBrandId:'b',brandId:'c',categoryId:'foreign',locationIds:['foreign'],...extra});
for(const [path,reference]of [
 ['comboMenus/group',{comboName:'QA Meal',productGroups:[{productIds:['hellerup']}]}],
 ['comboMenus/upgrade',{comboName:'QA Upgrade',upgradeProductIds:['hellerup']}],
 ['standard_discounts/product',{discountName:'QA Product Offer',discountType:'product',referenceIds:['hellerup']}],
 ['upsells/offer',{upsellName:'QA Suggested Product',offerType:'product',offerProductIds:['hellerup']}],
 ['upsells/trigger',{upsellName:'QA Cart Trigger',triggerConditions:[{type:'product_in_cart',referenceId:'hellerup'}]}],
])test(`brand move rejects source reference ${path}, even when inactive`,async()=>{
 const f=fixture();f.records.set(path,{brandId:'b',isActive:false,...reference});
 const before=structuredClone([...f.records]);
 const result=await f.actions.createOrUpdateProduct(null,moveForm({imageUrl:new File([await image()],'replacement.jpg',{type:'image/jpeg'})}));
 assert.equal(result.ok,false);assert.equal(result.error.code,'product/brand-in-use');
 assert.ok(result.error.message.includes(reference.comboName||reference.discountName||reference.upsellName));
 assert.ok(result.error.message.includes(`(${path.split('/')[1]})`));
 assert.equal(f.storageCalls.length,0);assert.equal(f.writes.length,0);assert.deepEqual([...f.records],before);
});
test('blocked brand move lists all dependencies once and permits retry after reference removal',async()=>{
 const f=fixture();
 f.records.set('comboMenus/meal',{brandId:'b',comboName:'Lunch',productGroups:[{productIds:['hellerup']},{productIds:['hellerup']}],upgradeProductIds:['hellerup']});
 f.records.set('standard_discounts/offer',{brandId:'b',discountName:'Lunch Offer',discountType:'product',referenceIds:['hellerup']});
 f.records.set('upsells/extra',{brandId:'b',upsellName:'Extra',offerProductIds:['hellerup'],triggerConditions:[{type:'product_in_cart',referenceId:'hellerup'}]});
 const result=await f.actions.createOrUpdateProduct(null,moveForm());
 assert.equal(result.ok,false);
 for(const text of ['Combo menu "Lunch" (meal)','Discount "Lunch Offer" (offer)','Upsell "Extra" (extra)'])assert.equal(result.error.message.split(text).length-1,1);
 assert.equal(f.writes.length,0);
 for(const path of ['comboMenus/meal','standard_discounts/offer','upsells/extra'])f.records.delete(path);
 const retry=await f.actions.createOrUpdateProduct(null,moveForm());
 assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(f.records.get('products/hellerup').brandId,'c');
});
test('brand move ignores other brands, unrelated products and non-product reference IDs',async()=>{
 const f=fixture();
 for(const [path,record]of [
  ['comboMenus/other-brand',{brandId:'c',productGroups:[{productIds:['hellerup']}]}],
  ['standard_discounts/other-brand',{brandId:'c',discountType:'product',referenceIds:['hellerup']}],
  ['upsells/other-brand',{brandId:'c',offerProductIds:['hellerup']}],
  ['comboMenus/unrelated',{brandId:'b',productGroups:[{productIds:['another-product']}]}],
  ['standard_discounts/category',{brandId:'b',discountType:'category',referenceIds:['hellerup']}],
  ['upsells/category',{brandId:'b',offerType:'category',offerCategoryIds:['hellerup'],triggerConditions:['category_in_cart','combo_in_cart','product_tag_in_cart'].map(type=>({type,referenceId:'hellerup'}))}],
 ])f.records.set(path,record);
 const before=structuredClone([...f.records].filter(([key])=>!key.startsWith('products/')));
 const result=await f.actions.createOrUpdateProduct(null,moveForm());
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(f.writes,['products/hellerup']);
 assert.deepEqual([...f.records].filter(([key])=>!key.startsWith('products/')),before);
});
test('same-brand edit remains possible while referenced and needs no dependency lookup',async()=>{
 const f=fixture();f.records.set('comboMenus/meal',{brandId:'b',productGroups:[{productIds:['hellerup']}]});
 f.failure.readCollection='comboMenus';
 const result=await f.actions.createOrUpdateProduct(null,form({id:'hellerup',originalBrandId:'b',productName:'Renamed product'}));
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.records.get('products/hellerup').brandId,'b');assert.equal(f.records.get('products/hellerup').productName,'Renamed product');
});
test('failed dependency lookup prevents brand move and image upload',async()=>{
 for(const collection of ['comboMenus','standard_discounts','upsells']){
  const f=fixture(),before=structuredClone([...f.records]);f.failure.readCollection=collection;
  const result=await f.actions.createOrUpdateProduct(null,moveForm({imageUrl:new File([await image()],'replacement.jpg',{type:'image/jpeg'})}));
  assert.equal(result.ok,false);assert.equal(f.storageCalls.length,0);assert.equal(f.writes.length,0);assert.deepEqual([...f.records],before);
 }
});

test('new product without an image never needs storage configuration or permission',async()=>{
 const previous=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
 delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
 try{
  for(const imageUrl of [
   undefined,
   new File([],'',{type:'application/octet-stream'}),
   // Next.js production Server Actions may preserve a name for an untouched
   // file input while submitting no bytes.
   new File([],'image.jpg',{type:'image/jpeg'}),
  ]){
   const f=fixture();f.failure.upload=Object.assign(Error('Access denied'),{code:403});
   const result=await f.actions.createOrUpdateProduct(null,form({imageUrl}));assert.equal(result.ok,true,JSON.stringify(result));
   const saved=await f.actions.getProductById(result.id);assert.equal(saved.productName,'Kildevand 0,5 l');assert.equal(saved.price,20);assert.equal(saved.priceDelivery,20);assert.deepEqual(saved.locationIds,['l']);assert.equal(Object.hasOwn(saved,'imageUrl'),false);
   assert.equal(f.storageCalls.length,0);assert.equal(f.objects.size,0);assert.equal(f.records.get('products/hellerup').imageUrl,'https://existing.example/keep.jpg');
  }
 }finally{previous===undefined?delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=previous;}
});
test('edit with a named zero-byte image submission preserves the existing image',async()=>{
 const f=fixture();f.failure.upload=Object.assign(Error('Access denied'),{code:403});
 const result=await f.actions.createOrUpdateProduct(null,form({
  id:'hellerup',originalBrandId:'b',productName:'Updated without a new image',
  imageUrl:new File([],'image.jpg',{type:'image/jpeg'}),
 }));
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.storageCalls.length,0);
 assert.equal(f.records.get('products/hellerup').imageUrl,'https://existing.example/keep.jpg');
 assert.equal(f.records.get('products/hellerup').productName,'Updated without a new image');
});
test('403 then removing selected file reuses creation key without a duplicate; image can be added later',async()=>{
 const f=fixture();const data=form({imageUrl:new File([await image()],'water.jpg',{type:'image/jpeg'})});
 f.failure.upload=Object.assign(Error('Access denied'),{code:403});const failed=await f.actions.createOrUpdateProduct(null,data);assert.equal(failed.ok,false);assert.equal(f.writes.length,0);
 data.delete('imageUrl');const result=await f.actions.createOrUpdateProduct(null,data);assert.equal(result.ok,true);assert.equal(f.writes.length,1);assert.equal(f.storageCalls.length,1);
 assert.equal((await f.actions.createOrUpdateProduct(null,data)).id,result.id);assert.equal(f.writes.length,1);
 f.failure.upload=false;const edit=form({id:result.id,originalBrandId:'b',imageUrl:new File([await image()],'water.jpg',{type:'image/jpeg'})});assert.equal((await f.actions.createOrUpdateProduct(null,edit)).ok,true);
 assert.equal(f.objects.size,1);assert.equal([...f.records.keys()].filter(k=>k.startsWith('products/')).length,2);assert.match(f.records.get('products/'+result.id).imageUrl,/firebasestorage/);
});
