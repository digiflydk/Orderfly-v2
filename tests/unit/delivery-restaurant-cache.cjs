const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
test('restaurant cache binds both IDs, clones public records, expires and invalidates with storefront tag',async()=>{
 let now=0,reads=0;const rows=new Map([['brands/a',{name:'A',currency:'DKK',ownerId:'PRIVATE'}],['locations/l',{brandId:'a',isActive:true,street:'First 1',apiKey:'PRIVATE'}]]),cache=new Map();
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({collection:c=>({doc:id=>({get:async()=>{reads++;return {exists:rows.has(c+'/'+id),data:()=>structuredClone(rows.get(c+'/'+id))};}})})})},'next/cache':{
  unstable_cache:(fn,key,options)=>{assert.deepEqual(options.tags,['storefront']);assert.equal(options.revalidate,60);return async(...args)=>{const k=JSON.stringify([key,args]);const hit=cache.get(k);if(hit&&hit.expiry>now)return hit.value;const value=await fn(...args);cache.set(k,{value,expiry:now+options.revalidate*1000});return value;};},
  revalidateTag:tag=>{assert.equal(tag,'storefront');cache.clear();}
 }});const s=load('src/lib/delivery/quotes/restaurant-cache.ts');
 const a=await s.loadQuoteRestaurant('a','l');assert.doesNotMatch(JSON.stringify(a),/PRIVATE/);a.location.street='poison';assert.equal((await s.loadQuoteRestaurant('a','l')).location.street,'First 1');assert.equal(reads,2);
 await s.loadQuoteRestaurant('b','l');assert.equal(reads,4);
 rows.get('locations/l').street='Changed 2';s.invalidateQuoteRestaurant();assert.equal((await s.loadQuoteRestaurant('a','l')).location.street,'Changed 2');assert.equal(reads,6);
 now=60000;await s.loadQuoteRestaurant('a','l');assert.equal(reads,8);
});
