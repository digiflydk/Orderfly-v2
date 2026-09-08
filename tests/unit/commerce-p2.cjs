const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {money,ore,discountedUnit,lineMoney}=loadTs('src/lib/money.ts');
const {basketTotals}=loadTs('src/lib/basket-totals.ts');
const {checkoutItems}=loadTs('src/lib/checkout-items.ts');
const {fulfillmentSlots}=loadTs('src/lib/fulfillment-time.ts');
const {calculateTimeSlots}=loadTs('src/lib/time-slots.ts');
const {comboEligible,comboProductsAvailable}=loadTs('src/lib/combo-eligibility.ts');
const {flattenMenu,searchMenu}=loadTs('src/lib/menu-display.ts');
const {checkoutRequestSchema}=loadTs('src/lib/checkout-schema.ts');
const {metricPayload,commercePage}=loadTs('src/lib/commerce-metrics.ts');
const {deliveryUrl}=loadTs('src/lib/delivery-url.ts');
const hours=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'00:00',close:'23:59'}]));
const location={id:'l',brandId:'b',isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:hours,deliveryFee:12.35};
const product={id:'p',brandId:'b',locationIds:['l'],isActive:true,productName:'Pizza',categoryId:'pizza',price:79.95};
const discount={id:'d',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup','delivery'],activeDays:[],activeTimeSlots:[],discountName:'Offer',discountType:'product',referenceIds:['p'],discountMethod:'percentage',discountValue:25};
const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-09-08T10:00:00Z')};

test('topping identities and labels accept the same 50-option limit',()=>{
 const args=[[{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100,toppings:Array.from({length:50},(_,i)=>`T${i}`),toppingIds:Array.from({length:50},(_,i)=>`t${i}`)}],{name:'Test',email:'test@example.test',phone:'12345678',acceptTerms:true,subscribeToNewsletter:false},'pickup','b','l',{subtotal:100,deliveryFee:0,discountTotal:0,tips:0,taxes:0},null,'brand','location',undefined,undefined];
 assert.equal(checkoutRequestSchema.safeParse(args).success,true);
 args[0][0].toppingIds.push('t51');assert.equal(checkoutRequestSchema.safeParse(args).success,false);
 const {cartChoiceSchema}=loadTs('src/lib/cart-snapshot.ts');
 const choice={id:'p',cartItemId:'line',itemType:'product',quantity:1,toppings:Array.from({length:50},(_,i)=>`T${i}`),toppingIds:Array.from({length:50},(_,i)=>`t${i}`),offered:false};
 assert.equal(cartChoiceSchema.safeParse(choice).success,true);
 choice.toppingIds.push('t51');choice.toppings.push('T51');assert.equal(cartChoiceSchema.safeParse(choice).success,false);
});
test('Copenhagen spring-forward has no impossible or duplicate slots and preserves real preparation minutes',()=>{
 const now=new Date('2026-03-29T00:50:00Z'); // 01:50 CET, 20 min later is 03:10 CEST.
 const times=calculateTimeSlots(location,'2026-03-29T12:00:00Z',now);
 assert.ok(times.pickup_times.length);assert.ok(times.pickup_times.every(at=>!at.startsWith('02:')));
 assert.equal(times.pickup_times[0],'03:10');
 const slots=fulfillmentSlots(location,'pickup','2026-03-29',now);
 assert.equal(slots[0],'2026-03-29T01:10:00.000Z');assert.equal(new Set(slots).size,slots.length);
 const autumn=fulfillmentSlots(location,'pickup','2026-10-25',new Date('2026-10-24T20:00:00Z'));
 assert.equal(new Set(autumn).size,autumn.length);
});
test('combo menu and restored cart share Copenhagen schedule and fulfillment eligibility',()=>{
 const combo={...discount,comboName:'Meal',pickupPrice:100,deliveryPrice:110,activeDays:['monday'],activeTimeSlots:[{start:'00:00',end:'01:00'}],orderTypes:['delivery'],productGroups:[]};
 const now=new Date('2026-09-06T22:30:00Z'); // Monday in Copenhagen; Sunday in UTC.
 assert.equal(comboEligible(combo,{...scope,deliveryType:'delivery',now}),true);
 assert.equal(comboEligible(combo,{...scope,now}),false);
 assert.equal(comboEligible(combo,{...scope,deliveryType:'delivery',locationId:'foreign',now}),false);
 const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
 const catalog={combos:[combo],products:[],discounts:[],upsells:[],toppings:[],groups:[]};
 const choice={id:'d',cartItemId:'one',itemType:'combo',quantity:1,toppings:[],comboSelections:[]};
 assert.equal(restoreCartItems([choice],catalog,{...scope,deliveryType:'delivery',now}).removed,0);
 assert.equal(restoreCartItems([choice],catalog,{...scope,now}).removed,1);
});
test('rendered combos require every configured product to be available in the scoped menu',()=>{
 const combo={productGroups:[{productIds:['p','side']}]};
 assert.equal(comboProductsAvailable(combo,[{id:'p'},{id:'side'}]),true);
 assert.equal(comboProductsAvailable(combo,[{id:'p'}]),false);
 assert.equal(comboProductsAvailable({productGroups:[]},[{id:'p'}]),false);
});
test('virtual category preserves products without altering native promotion scope; search matches name and description',()=>{
 const products=flattenMenu({__virtual_menu__:[{...product,description:'Tomat og basilikum'}]});
 assert.equal(products[0].categoryId,'pizza');assert.equal(products[0].displayCategoryId,'__virtual_menu__');
 assert.equal(products.filter(p=>p.displayCategoryId==='__virtual_menu__').length,1);
 assert.equal(searchMenu(products,'  PIZZA  tomat ').length,1);assert.equal(searchMenu(products,'bacon').length,0);
 assert.equal(searchMenu(products,'').length,1);
});
test('delivery URL replaces stale mode and retains product filters, attribution and fragment',()=>{
 const url=deliveryUrl('https://orderfly.test/cphpizza/hellerup?deliveryMethod=pickup&utm_source=fixture&search=pizza#menu','delivery');
 assert.equal(url,'/cphpizza/hellerup?deliveryMethod=delivery&utm_source=fixture&search=pizza#menu');
 assert.equal(new URL(url,'https://test').searchParams.getAll('deliveryMethod').length,1);
});
test('blocked storage reads/writes/removal use memory without inventing consent',()=>{
 const old=global.window;global.window={get localStorage(){throw Error('denied');}};
 try {
 const store=loadTs('src/lib/optional-storage.ts');assert.equal(store.optionalGet('consent'),null);store.optionalSet('consent','false');assert.equal(store.optionalGet('consent'),'false');store.optionalRemove('consent');assert.equal(store.optionalGet('consent'),null);
 // Quota/cookie restrictions can reject writes while still returning an old value.
 global.window={localStorage:{getItem:()=> 'true',setItem:()=>{throw Error('quota');},removeItem:()=>{throw Error('denied');}}};
 store.optionalSet('another-choice','false');assert.equal(store.optionalGet('another-choice'),'false');
 store.optionalRemove('another-choice');assert.equal(store.optionalGet('another-choice'),null);
 }finally{global.window=old;}
});
test('cookie configuration projects only public text, preserves defaults and does not cross scopes',async()=>{
 const {mergeCookieTexts,defaultTexts}=loadTs('src/lib/cookie-texts.ts');
 const result=mergeCookieTexts({banner_title:'Fixture',privateKey:'secret',categories:{necessary:{title:'Nødvendig'}}});
 assert.equal(result.banner_title,'Fixture');assert.equal(result.categories.necessary.description,defaultTexts.categories.necessary.description);assert.equal(result.privateKey,undefined);
});
test('public option reads deduplicate requests, separate restaurant scopes and retry failures',async()=>{
 const old=global.fetch;let calls=0;
 try {global.fetch=async url=>{calls++;return {ok:true,json:async()=>({url})};};
 const {publicRead}=loadTs('src/lib/public-read.ts');const [a,b]=await Promise.all([publicRead('/a'),publicRead('/a')]);assert.deepEqual(a,b);assert.equal(calls,1);
 await publicRead('/b');assert.equal(calls,2);
 global.fetch=async()=>{calls++;throw Error('offline');};await assert.rejects(publicRead('/retry'));await assert.rejects(publicRead('/retry'));assert.equal(calls,4);
 global.fetch=async()=>({ok:true,json:async()=>({ok:true})});assert.equal((await publicRead('/retry')).ok,true);
 }finally{global.fetch=old;}
});
test('unresolved option reads time out and the next click starts a fresh request',async()=>{
 const old=global.fetch;let calls=0;
 try {global.fetch=()=>{calls++;return new Promise(()=>{});};const {publicRead}=loadTs('src/lib/public-read.ts');await assert.rejects(publicRead('/slow',10),/timed out/);await assert.rejects(publicRead('/slow',10),/timed out/);assert.equal(calls,2);}finally{global.fetch=old;}
});
test('one integer-øre contract rounds item offers before quantity, including the half-øre boundary',()=>{
 assert.equal(money(1.005),1.01);assert.equal(discountedUnit(79.95,'percentage',25),59.96);
 assert.equal(lineMoney(59.96,3,[2.35]),186.93);
 const {validateCheckoutPrices}=loadTs('src/lib/checkout-price-validation.ts');
 const line={id:'p',name:'Pizza',quantity:3,unitPrice:59.96,totalPrice:179.88};
 const catalog=[{id:'p',price:79.95,isCombo:false,tags:[],categoryId:'pizza'}];
 validateCheckoutPrices([line],catalog,[discount],[],scope);
 assert.throws(()=>validateCheckoutPrices([{...line,unitPrice:59.95,totalPrice:179.85}],catalog,[discount],[],scope));
});
for(const kind of ['none','item','code','automatic'])test(`cart, saved order and Stripe sum exactly for fractional prices: ${kind}`,async()=>{
 const itemPrice=kind==='item'?discountedUnit(product.price,'percentage',25):product.price;
 const item={...product,itemType:'product',cartItemId:'cart',basePrice:product.price,price:itemPrice,quantity:3,toppings:[],tags:[]};
 const standard=kind==='item'?[discount]:kind==='automatic'?[{...discount,discountType:'cart',discountValue:12.5}]:[];
 const voucher=kind==='code'?{id:'v',code:'FIXTURE',discountType:'percentage',discountValue:12.5}:null;
 const brand={id:'b',bagFee:4,adminFeeType:'percentage',adminFee:2.5,vatPercentage:25};
 const totals=basketTotals({cartItems:[item],appliedDiscount:voucher,standardDiscounts:standard,deliveryType:'pickup',location,brand,includeBagFee:true});
 const cartDiscount=totals.voucherDiscount?.amount || totals.automaticCartDiscount?.amount || 0;
 const result=await checkout({kind:kind==='code'?'code':'none',items:checkoutItems([item]),seed:[['products/p',product],...(kind==='code'?[['discounts/d',{...voucher,brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],applicationType:'code'}]]:[])],brandOverrides:brand,standardDiscounts:standard,expectedCartDiscount:cartDiscount});
 assert.equal(result.result.success,true,result.result.error);
 const order=result.writes.find(write=>write.ref.collection==='orders'&&write.data.productItems).data;
 const stripeCents=result.sessionParams.line_items.reduce((sum,line)=>sum+line.price_data.unit_amount*line.quantity,0)-(result.coupon?.amount_off||0);
 assert.equal(stripeCents,ore(totals.checkoutTotal));assert.equal(ore(order.totalAmount),stripeCents);assert.equal(order.paymentDetails.adminFee,totals.adminFee);assert.equal(order.paymentDetails.vatAmount,totals.vatAmount);
});
test('metrics reject browser-paid claims and redact customer, payment, attribution and query data',()=>{
 const raw={brandId:'b',sessionId:'uuid',eventId:'fixture',cartValue:100,email:'private@example.test',receipt_token:'secret',paymentIntentId:'pi_private',urlPath:'/receipt?secret',utm_term:'private',orderId:'ORD-PRIVATE',deviceType:'mobile'};
 const safe=metricPayload('start_checkout',raw);assert.deepEqual(safe,{name:'start_checkout',brandId:'b',sessionId:'uuid',eventId:'fixture',cartValue:100,deviceType:'mobile'});
 assert.equal(metricPayload('payment_succeeded',raw),null);assert.equal(metricPayload('payment_succeeded',raw,true).orderId,'ORD-PRIVATE');
 assert.equal(commercePage('/cphpizza/m3-pizza-hellerup/checkout/confirmation'),'receipt');assert.equal(commercePage('/superadmin/orders'),'other');
});
test('metrics collection failures and invalid consent cannot escape into the customer click handler',()=>{
 const oldWindow=global.window,oldDocument=global.document,oldFetch=global.fetch;
 global.window={localStorage:{getItem:()=>null}};global.document={cookie:'orderfly_cookie_consent=not-json'};global.fetch=()=>{throw Error('telemetry blocked');};
 try {const {trackClientEvent}=loadTs('src/lib/analytics.ts');assert.equal(trackClientEvent('add_to_cart',{}),false);global.document.cookie='orderfly_cookie_consent='+encodeURIComponent(JSON.stringify({statistics:true}));assert.doesNotThrow(()=>trackClientEvent('add_to_cart',{}));}finally{global.window=oldWindow;global.document=oldDocument;global.fetch=oldFetch;}
});
test('performance report separates devices/releases, computes p75 and counts paid orders once',()=>{
 const {summarize}=require('../../scripts/commerce-metrics-report.cjs');
 const common={source:'commerce-v1',release:'abcdef0',deviceType:'mobile',pageType:'menu'};
 const rows=[1000,2000,3000,4000].map((value,i)=>({...common,name:'web_vital',metricName:'LCP',metricId:'m'+i,sessionId:'s'+i,value}));
 rows.push({...rows[3]}); // repeated final metric must not bias p75.
 rows.push({...common,id:'commerce-trusted',name:'payment_succeeded',verifiedPayment:true,provenance:'server-verified-payment-v1',orderId:'ORD-1',brandId:'b',sessionId:'s0'});
 rows.push({...rows.at(-1)},{...rows.at(-1),verifiedPayment:false,orderId:'fake'},
   {...common,id:'attacker',name:'payment_succeeded',verifiedPayment:true,orderId:'FORGED',brandId:'b',sessionId:'forged'},
   {...rows[0],release:'different',value:99999});
 const report=summarize(rows,'abcdef0');assert.equal(report.vitals[0].samples,4);assert.equal(report.vitals[0].p75,3000);assert.equal(report.vitals[0].meetsTarget,false);
 assert.equal(report.funnel[0].verifiedOrders,1);assert.equal(report.funnel[0].sessions.payment_succeeded,1);
 assert.ok(!JSON.stringify(report).includes('ORD-1'));
});
test('native metric records deduplicate signed payment notifications and do not retain secrets',async()=>{
 const docs=new Map();const savedEnvironment={...process.env};delete process.env.GA_API_SECRET;
 try {
 const {recordCommerceMetric}=loadTs('src/lib/server/record-commerce-metric.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:id=>({set:async value=>docs.set(id,value)})})})}});
 const event={brandId:'b',locationId:'l',sessionId:'opaque',orderId:'ORD-1',paymentIntentId:'pi_secret',receipt_token:'secret',email:'customer@example.test',cartValue:123.45};
 await recordCommerceMetric('payment_succeeded',event,true);await recordCommerceMetric('payment_succeeded',event,true);assert.equal(docs.size,1);
 assert.equal([...docs.values()][0].verifiedPayment,true);assert.equal([...docs.values()][0].provenance,'server-verified-payment-v1');assert.ok(!JSON.stringify([...docs]).includes('secret'));assert.ok(!JSON.stringify([...docs]).includes('customer@example.test'));
 }finally{if(savedEnvironment.GA_API_SECRET!==undefined)process.env.GA_API_SECRET=savedEnvironment.GA_API_SECRET;}
});
test('legacy analytics route sanitizes public events before the server write',async()=>{
 let seen;
 const {POST}=loadTs('src/app/api/analytics/route.ts',{
  '@/lib/server/record-commerce-metric':{recordCommerceMetric:async(name,event)=>{seen={name,event};}},
 });
 const response=await POST(new Request('https://test/api/analytics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'add_to_cart',sessionId:'session',eventId:'event',productId:'p',source:'commerce-v1',verifiedPayment:true,orderId:'FORGED'})}));
 assert.equal(response.status,200);assert.deepEqual(seen,{name:'add_to_cart',event:{name:'add_to_cart',sessionId:'session',eventId:'event',productId:'p'}});
 const forged=await POST(new Request('https://test/api/analytics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'payment_succeeded',sessionId:'session',eventId:'event',source:'commerce-v1',verifiedPayment:true,orderId:'FORGED'})}));
 assert.equal(forged.status,400);
});
test('public product options require the native restaurant owner and preserve default selection and ordering',async()=>{
 const query=name=>({where(){return this;},get:async()=>({docs:name==='toppings'?[{id:'t',data:()=>({brandId:'b',toppingName:'Extra',price:1.005,isDefault:true,sortOrder:4,groupId:'g',secret:'private'})}]:[{id:'g',data:()=>({groupName:'Extras',minSelection:1,maxSelection:1})}]})});
 let owner='b',reads=0;
 const db={collection:name=>name==='locations'?{doc:()=>({get:async()=>({exists:true,data:()=>({brandId:owner,isActive:true})})})}:(reads++,query(name))};
 const {GET}=loadTs('src/app/api/public/product-options/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>db},'next/cache':{unstable_cache:fn=>fn}});
 const valid=await GET(new Request('https://test/api/public/product-options?brandId=b&locationId=l'));assert.equal(valid.status,200);const options=await valid.json();assert.equal(options.toppings[0].isDefault,true);assert.equal(options.toppings[0].sortOrder,4);assert.equal(options.toppings[0].price,1.01);assert.equal(options.toppings[0].secret,undefined);
 owner='other';reads=0;assert.equal((await GET(new Request('https://test/api/public/product-options?brandId=b&locationId=l'))).status,503);assert.equal(reads,0);
});
