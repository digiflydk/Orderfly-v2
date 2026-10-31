const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {esmeraldaMenuImage,esmeraldaPizzaImage,ESMERALDA_MENU_IMAGE_PATHS}=loadTs('src/lib/esmeralda-menu-images.ts');
const pizzas=require('../fixtures/esmeralda-pizza-images.json');
const brand='oeypKaMyYcQjIwaa1PtV', combo='esmeralda-v2-pizzamenu-20261030', soda='f10a57a7-ecfa-4f70-86b0-b0b435120440';
test('menu cutouts remain scoped to V2, brand and approved combo',()=>{
 assert.equal(esmeraldaMenuImage(false,brand,combo,soda),undefined);
 assert.equal(esmeraldaMenuImage(true,'other',combo,soda),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,'other',soda),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,combo,'unknown'),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,combo,soda).illustration,false);
});

test('all fifteen photographed pizza products have an exact source-aware cutout',()=>{
 assert.equal(pizzas.length,15);
 for(const product of pizzas){
  const before=JSON.stringify(product);
  const asset=esmeraldaPizzaImage(true,product);
  assert.equal(asset?.src,`/images/esmeralda-v2/menu/pizza-${product.id}.webp`,product.productName);
  assert.ok(ESMERALDA_MENU_IMAGE_PATHS.includes(asset.src));
  assert.ok(fs.existsSync(`public${asset.src}`),product.productName);
  assert.deepEqual(esmeraldaPizzaImage(true,{...product,imageUrl:product.imageUrl+'?alt=media&token=rotated'}),asset,'download token changes retain the same source photo');
  assert.equal(JSON.stringify(product),before,'rendering leaves catalog/order data intact');
 }
 assert.equal(pizzas.filter(p=>p.categoryId==='RbHTbJlcCXQiQ3dgSQyw').length,2,'both photographed Nutella variants are covered');
});

test('pizza overrides reject other brands, categories, sources and removed images',()=>{
 const product=pizzas[0];
 for(const changed of [
  {...product,brandId:'other'}, {...product,categoryId:'other'}, {...product,id:'other'},
  {...product,imageUrl:product.imageUrl.replace('firebasestorage.googleapis.com','example.com')},
  {...product,imageUrl:product.imageUrl.replace(/[^/]+$/, 'new-photo.avif')},
  {...product,imageUrl:product.imageUrl+'-not-the-same-source'},
  {...product,imageUrl:'/custom-upsell-art.webp'},
  {...product,imageUrl:null}, {...product,imageUrl:undefined}, {...product,imageUrl:''},
 ]) assert.equal(esmeraldaPizzaImage(true,changed),undefined);
 assert.equal(esmeraldaPizzaImage(false,product),undefined);
 for(const id of ['8bd60d2d-189f-4125-a9ea-8cdee62da24b','1cd99b44-2159-4b44-bb94-e8eb6c5a6e73','ca2a037a-9d70-4b4e-a5c4-d7217b465be8']){
  assert.equal(esmeraldaPizzaImage(true,{...product,id}),undefined,'missing photos and Pizza Combo get no invented substitute');
 }
});

test('pizza assets retain transparent alpha and complete visible edges',async()=>{
 const sharp=require('sharp');
 for(const product of pizzas){
  const asset=esmeraldaPizzaImage(true,product);
  const image=sharp(`public${asset.src}`);const metadata=await image.metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.hasAlpha,true,product.productName);
  assert.equal(metadata.width,960);assert.equal(metadata.height,960,'consistent square canvas keeps pizza thumbnails comparable');
  const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,opaque=0,edgeAlpha=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const a=data[(y*info.width+x)*info.channels+3];
   if(a===0)transparent++;if(a>=250)opaque++;
   if((x===0||y===0||x===info.width-1||y===info.height-1)&&a>0)edgeAlpha++;
  }
  assert.ok(transparent>info.width*info.height*.1,'canvas has genuinely transparent background');
  assert.ok(opaque>info.width*info.height*.1,'food remains near-opaque (alpha at least 250)');
  assert.equal(edgeAlpha,0,'food is not cut off at the asset edge');
 }
});
test('missing dip photos have existing clearly marked illustration assets',()=>{
 for(const name of ['chili','dressing','pesto']){
  const asset=esmeraldaMenuImage(true,brand,combo,`esmeralda-v2-combo-dip-${name}-20261030`);
  assert.equal(asset.illustration,true);assert.ok(fs.existsSync(`public${asset.src}`));
 }
});
