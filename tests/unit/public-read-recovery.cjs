const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const valid=value=>!!value&&Array.isArray(value.groups)&&Array.isArray(value.toppings);
const good=()=>Response.json({groups:[],toppings:[]});
async function withFetch(fetch,run){const before=global.fetch;global.fetch=fetch;try{return await run();}finally{global.fetch=before;}}
test('one transient GET retry is shared across concurrent catalog reads and cached after success',()=>withFetch(async()=>++calls===1?new Response('',{status:503}):good(),async()=>{
 const {publicRead}=loadTs('src/lib/public-read.ts');const opts={retryTransient:true,validate:valid};
 const [a,b]=await Promise.all([publicRead('/scoped',50,opts),publicRead('/scoped',50,opts)]);
 assert.deepEqual(a,{groups:[],toppings:[]});assert.equal(a,b);await publicRead('/scoped',50,opts);assert.equal(calls,2);
}));let calls=0;
test('timeouts abort only the read, permit one retry, and never wait forever',()=>withFetch(async(_url,{signal})=>{
 ++calls;if(calls===1){signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});}return good();
},async()=>{calls=0;aborted=false;const {publicRead}=loadTs('src/lib/public-read.ts');assert.deepEqual(await publicRead('/timeout',5,{retryTransient:true,validate:valid}),{groups:[],toppings:[]});assert.equal(calls,2);assert.equal(aborted,true);}));let aborted=false;
test('auth/scope rejection and malformed data are never automatically retried or retained in cache',async()=>{
 for(const response of [()=>new Response('',{status:400}),()=>new Response('',{status:403}),()=>new Response('not-json'),()=>Response.json({groups:null,toppings:[]})]){
  let reads=0;await withFetch(async()=>{reads++;return response();},async()=>{
   const {publicRead}=loadTs('src/lib/public-read.ts');await assert.rejects(publicRead('/invalid',20,{retryTransient:true,validate:valid}));assert.equal(reads,1);
   global.fetch=async()=>{reads++;return good();};assert.deepEqual(await publicRead('/invalid',20,{retryTransient:true,validate:valid}),{groups:[],toppings:[]});assert.equal(reads,2);
  });
 }
});
test('transient failure retries at most once and old public reads retain their no-retry contract',async()=>{
 let reads=0;await withFetch(async()=>{reads++;return new Response('',{status:503});},async()=>{
  const {publicRead}=loadTs('src/lib/public-read.ts');await assert.rejects(publicRead('/catalog',20,{retryTransient:true}));assert.equal(reads,2);
  await assert.rejects(publicRead('/old-default',20));assert.equal(reads,3);
 });
});
test('product option reads reject invalid scope before IO and keep location/brand caches separate',async()=>{
 const urls=[];await withFetch(async url=>{urls.push(url);return good();},async()=>{
  const {readProductOptions}=moduleGraph({})('src/lib/product-options-read.ts');
  await assert.rejects(readProductOptions('brand/foreign','loc'));assert.deepEqual(urls,[]);
  await readProductOptions('brand','loc');await readProductOptions('brand','other');await readProductOptions('other','loc');
  assert.equal(new Set(urls).size,3);for(const url of urls){const u=new URL(url,'https://test');assert.equal(u.pathname,'/api/public/product-options');assert.ok(u.searchParams.get('brandId'));assert.ok(u.searchParams.get('locationId'));}
 });
});
test('a generic cached response cannot bypass stricter caller validation and wrong-location options are rejected',async()=>{
 let reads=0;await withFetch(async()=>{reads++;return Response.json({groups:[{id:'g',locationIds:['foreign']}],toppings:[]});},async()=>{
  const load=moduleGraph({}),{publicRead}=load('src/lib/public-read.ts'),{readProductOptions}=load('src/lib/product-options-read.ts');
  await publicRead('/api/public/product-options?brandId=b&locationId=l');
  await assert.rejects(readProductOptions('b','l'));assert.equal(reads,1,'cache hit is validated without a retry');
  global.fetch=async()=>{reads++;return good();};assert.deepEqual(await readProductOptions('b','l'),{groups:[],toppings:[]});assert.equal(reads,2);
 });
});
