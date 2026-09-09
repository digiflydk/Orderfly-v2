const {test}=require('node:test');
const assert=require('node:assert/strict');
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
for(const overrides of [{brandId:''},{brandId:'missing'},{locationIds:['foreign']},{categoryId:'foreign'},{toppingGroupIds:['foreign']},{allergenIds:['missing']},{id:'hellerup',brandId:'c'},{price:'-1'},{imageUrl:'https://picsum.photos/fake.jpg'}])test(`reject invalid/scoped input ${JSON.stringify(overrides)}`,async()=>{
 const f=fixture();const result=await f.actions.createOrUpdateProduct(null,form(overrides));assert.equal(result.ok,false);assert.equal(f.writes.length,0);assert.equal(f.objects.size,0);
});
test('upload failure preserves stored record; retry creates once even after lost acknowledgement',async()=>{
 const f=fixture(),bytes=await image();const data=form({imageUrl:new File([bytes],'water.jpg',{type:'image/jpeg'})});
 f.failure.upload=true;const failed=await f.actions.createOrUpdateProduct(null,data);assert.equal(failed.ok,false);assert.match(failed.error.detail,/Image upload failed/);assert.equal(f.writes.length,0);
 f.failure.upload=false;f.failure.afterWrite=true;const saved=await f.actions.createOrUpdateProduct(null,data);assert.equal(saved.ok,true,JSON.stringify(saved));
 const retry=await f.actions.createOrUpdateProduct(null,data);assert.equal(retry.id,saved.id);assert.equal(f.writes.length,1);assert.equal(f.objects.size,1);
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
