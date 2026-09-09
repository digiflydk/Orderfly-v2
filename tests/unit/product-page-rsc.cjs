const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
// Use the exact RSC renderer and React build shipped with the installed Next.js.
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react'||name==='next/dist/compiled/react')return original.call(this,'next/dist/compiled/react/react.react-server.js',...args);
 if(name==='react-dom')return original.call(this,'next/dist/compiled/react-dom',...args);
 if(name==='react/jsx-runtime')return original.call(this,'next/dist/compiled/react/jsx-runtime.react-server.js',...args);
 return original.call(this,name,...args);
};
const React=require('react');
const {renderToPipeableStream,registerClientReference}=require('next/dist/compiled/react-server-dom-webpack/server.node');
const {PassThrough}=require('node:stream');
const {fixture,timestamp}=require('../helpers/product-page-fixture.cjs');
const Client=registerClientReference(()=>{},'fixture-client','default');
function render(element){return new Promise((resolve,reject)=>{
 const errors=[],stream=new PassThrough();let payload='';
 stream.on('data',chunk=>payload+=chunk);stream.on('error',reject);stream.on('end',()=>resolve({errors,payload}));
 renderToPipeableStream(element,{'fixture-client':{id:'fixture-client',chunks:[],name:'default'}},
  {onError:error=>{errors.push(error.message);return 'QA_RSC_ERROR';}}).pipe(stream);
});}

test('regression reproducer: raw Firestore timestamp fails the real RSC boundary',async()=>{
 const result=await render(React.createElement(Client,{product:{updatedAt:timestamp()}}));
 assert.equal(result.errors.length,1);assert.match(result.errors[0],/Only plain objects/);assert.match(result.payload,/QA_RSC_ERROR/);
});
for(const kind of ['list','edit','new'])test(`${kind} product page renders through the real RSC boundary with timestamps in every related dataset`,async()=>{
 const f=fixture();const Page=f.loadPage(kind,Client);
 const result=await render(React.createElement(Page,{params:Promise.resolve({productId:'p'})}));
 assert.deepEqual(result.errors,[]);assert.doesNotMatch(result.payload,/QA_RSC_ERROR/);
 assert.match(result.payload,/Esmeralda QA/);assert.match(result.payload,/QA Amager/);assert.match(result.payload,/\$D2026-09-09T05:00:00.000Z/);
 if(kind!=='new')assert.match(result.payload,/QA Pizza/);
 if(kind==='list')assert.match(result.payload,/QA Fries/);
 else {assert.match(result.payload,/QA Extras/);assert.match(result.payload,/QA Milk/);}
});

test('product readers preserve canonical identities, order zero and unsorted products without changing data',async()=>{
 const f=fixture();const items=await f.products.getProducts();assert.deepEqual(items.map(p=>p.id),['p','no-price','unsorted']);
 assert.equal(items[0].price,84);assert.equal(items[0].sortOrder,0);assert.ok(items[0].createdAt instanceof Date);
 assert.ok(items[0].metadata.importedAt instanceof Date);assert.equal(f.records.get('products/p').id,'obsolete-id');
 const item=await f.products.getProductById('p');assert.equal(item.id,'p');assert.ok(item.updatedAt instanceof Date);
 assert.equal((await f.products.getProductById('missing')),null);
});

test('missing product edit remains a not-found result instead of opening an empty editor',async()=>{
 const f=fixture();await assert.rejects(f.pageProps('edit','missing'),/NOT_FOUND/);
});
