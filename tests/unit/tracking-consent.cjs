const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadTs}=require('../helpers/load-ts.cjs');

// Execute the real generated runtime with inert script elements: no browser or network.
function runtime(consent, gtm=false){
 const previous={window:global.window,document:global.document};
 const messages=[],elements=[],listeners={};let frame, parentListener, config;
 global.window={location:new URL('https://orderfly.dk/esmeralda/amager?utm_source=google&gclid=click123&receipt_token=secret'),addEventListener(type,fn){parentListener=fn},removeEventListener(){},dispatchEvent(){}};
 global.document={cookie:'',referrer:'',createElement:()=>frame={setAttribute(){},contentWindow:{postMessage(data){config=data.config}},remove(){}},body:{appendChild(){}}};
 try{
  const {mountBrandTracking,BRAND_TRACKING_DOCUMENT}=loadTs('src/lib/brand-tracking-frame.ts');
  mountBrandTracking({id:'b',ga4MeasurementId:'G-TEST',gtmContainerId:gtm?'GTM-TEST':undefined,googleAdsConversionId:'AW-TEST',googleAdsPurchaseLabel:'paid',metaPixelId:'123'},consent);
  if(!frame)return null;
  const parent={postMessage:x=>messages.push(x)};
  parentListener({source:frame.contentWindow,origin:'https://orderfly.dk',data:{type:'orderfly:frame-loaded'}});
  const context={parent,location:{origin:'https://orderfly.dk'},removeEventListener(){},document:{createElement:()=>({}),head:{appendChild:x=>elements.push(x)}},addEventListener:(type,fn)=>listeners[type]=fn,Date,encodeURIComponent};
  context.window=context;vm.createContext(context);
  vm.runInContext(BRAND_TRACKING_DOCUMENT.match(/<script>([\s\S]*)<\/script>/)[1],context);
  listeners.message({source:parent,origin:'https://orderfly.dk',data:{type:'orderfly:brand-init',config}});
  return {context,elements,send:event=>listeners.message({source:parent,origin:'https://orderfly.dk',data:{type:'orderfly:brand-event',event}}),google:()=>Array.from(context.dataLayer).filter(x=>x[0]==='event').map(x=>[...x]),meta:()=>context.fbq?Array.from(context.fbq.queue,x=>[...x]):[],html:JSON.stringify(config)};
 }finally{global.window=previous.window;global.document=previous.document;}
}
for(const [statistics,marketing] of [[false,false],[true,false],[false,true],[true,true]])test(`runtime consent statistics=${statistics}, marketing=${marketing}`,()=>{
 const r=runtime({statistics,marketing});
 if(!statistics&&!marketing){assert.equal(r,null);return;}
 for(const event of ['view_menu','view_product','add_to_cart','start_checkout'])r.send({event,brandId:'b',productId:'p',itemsCount:2,cartValue:50,eventId:'e'});
 r.send({event:'purchase',brandId:'b',ecommerce:{transaction_id:'order-1',value:100,currency:'DKK',items:[{item_id:'p',price:50,quantity:2}]}});
 assert.equal(r.elements.some(x=>x.src?.includes('facebook')),marketing);
 if(marketing){
  assert.equal(r.context._fbq,r.context.fbq,'Meta loader must find the same bootstrap through both public aliases');
  assert.equal(r.context.fbq.push,r.context.fbq,'Meta loader requires the documented push alias');
 }
 assert.deepEqual(r.google().filter(x=>x[2].send_to==='G-TEST').map(x=>x[1]),statistics?['view_item_list','view_item','add_to_cart','begin_checkout','purchase']:[]);
 assert.equal(r.google().filter(x=>x[1]==='conversion').length,marketing?1:0);
 assert.deepEqual(r.meta().filter(x=>x[0]==='trackSingle').map(x=>x[2]),marketing?['PageView','ViewContent','AddToCart','InitiateCheckout','Purchase']:[]);
 assert.equal(r.context.dataLayer[0][1],'default');
 assert.equal(r.context.dataLayer[0][2].ad_user_data,marketing?'granted':'denied');
 if(!marketing)assert.doesNotMatch(r.html,/click123/);
 assert.doesNotMatch(r.html,/receipt_token|secret/);
});
test('GTM has exclusive GA events; Ads and Meta have one direct owner; foreign brands are rejected',()=>{
 const r=runtime({statistics:true,marketing:true},true);
 r.send({event:'purchase',brandId:'wrong',ecommerce:{transaction_id:'wrong'}});
 r.send({event:'purchase',brandId:'b',ecommerce:{transaction_id:'correct',value:20,currency:'DKK',items:[]}});
 assert.equal(r.context.dataLayer.filter(x=>x.event==='purchase').length,1);
 assert.equal(r.google().filter(x=>x[1]==='purchase').length,0);
 assert.equal(r.google().filter(x=>x[1]==='conversion').length,1);
 assert.equal(r.meta().filter(x=>x[2]==='Purchase').length,1);
});
test('purchase can wait for a runtime, deduplicates per purpose and never sends to a different brand',()=>{
 const old={window:global.window,document:global.document,sessionStorage:global.sessionStorage};
 const storage=new Map(),sent=[];let consent={statistics:true,marketing:false};
 global.window={localStorage:{getItem:()=>JSON.stringify(consent)}};global.document={cookie:''};
 global.sessionStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
 try{
  const {pushPaidPurchase}=loadTs('src/lib/analytics.ts');
  const order={orderId:'o',brandId:'b',locationId:'l',value:50,items:[{id:'p',quantity:2,unitPrice:25}]};
  assert.equal(pushPaidPurchase(order),false);
  global.window.orderflyBrandTracker={brandId:'wrong',ready:true,statistics:true,marketing:true,emit:x=>sent.push(x)};
  assert.equal(pushPaidPurchase(order),false);
  global.window.orderflyBrandTracker={brandId:'b',ready:true,statistics:true,marketing:true,emit:x=>sent.push(x)};
  assert.equal(pushPaidPurchase(order),true);assert.equal(pushPaidPurchase(order),false);
  consent={statistics:true,marketing:true};
  assert.equal(pushPaidPurchase(order),true);assert.deepEqual(sent[1].destinations,{statistics:false,marketing:true});
  consent={statistics:false,marketing:false};assert.equal(pushPaidPurchase(order),false);
  assert.equal(sent.length,2);assert.equal(sent[0].ecommerce.items[0].quantity,2);
 }finally{Object.assign(global,old);}
});
test('server commerce metrics never contact a global GA destination, including paid orders',async()=>{
 const old=global.fetch, calls=[];global.fetch=async(...args)=>{calls.push(args);throw Error('External request forbidden');};
 const env={GA_MEASUREMENT_ID:process.env.GA_MEASUREMENT_ID,GA_API_SECRET:process.env.GA_API_SECRET};
 process.env.GA_MEASUREMENT_ID='G-WRONG-BRAND';process.env.GA_API_SECRET='fixture-only';
 try{
  const writes=[];
  const {recordCommerceMetric}=loadTs('src/lib/server/record-commerce-metric.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({set:async x=>writes.push(x)})})})}});
  await recordCommerceMetric('payment_succeeded',{brandId:'b',orderId:'o',sessionId:'s',cartValue:20},true);
  assert.equal(writes.length,1);assert.equal(calls.length,0);
 }finally{global.fetch=old;for(const [key,value]of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
