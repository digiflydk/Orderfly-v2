const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const {putCartItem}=loadTs('src/lib/cart-edit.ts');
const {recordNewsletterConsent,contactKey}=loadTs('src/lib/marketing/store.ts',mocks);
const {consentPayload,emailChannel,NEWSLETTER_CONSENT_VERSION}=loadTs('src/lib/marketing/consent.ts');
const {Omnisend}=loadTs('src/lib/marketing/provider.ts',mocks);
const {runMarketingWorker,retryMarketingJob}=loadTs('src/lib/marketing/worker.ts',mocks);
const line={id:'p',cartItemId:'one',itemType:'product',productName:'Pizza',brandId:'b',price:75,basePrice:75,quantity:1,toppings:[]};
const consent={brandId:'b',brandName:'Fixture',customerId:'c',locationId:'l',email:'Buyer@EXAMPLE.test',submissionId:'4a660928-2188-4b2b-a2d7-354a923db5ab',version:NEWSLETTER_CONSENT_VERSION};
const config={brandId:'b',omnisendBrandId:'ob',apiKey:'synthetic-test-key',enabled:true,consentMode:'single_opt_in'};
function database(){const db=memoryDb();db.rows.set('customers/c',{brandId:'b',normalizedEmail:'buyer@example.test',marketingConsent:false});return db;}
function channel(status,time='2026-09-08T12:00:00Z'){return {id:'provider',identifiers:[{type:'email',id:'buyer@example.test',channels:{email:{status,statusChangedAt:time}}}]};}

test('#71 atomic edit replaces only its exact line and retains identity',()=>{
 const second={...line,cartItemId:'two',toppings:[{id:'t',name:'Ost',price:5}]};
 const result=putCartItem([line,second],{...line,cartItemId:'new',toppings:[{id:'x',name:'Chili',price:2}]},line);
 assert.equal(result.length,2);assert.equal(result[0].cartItemId,'one');assert.deepEqual(result[1],second);assert.equal(result[0].toppings[0].id,'x');
 assert.deepEqual(line.toppings,[],'draft did not mutate the original');
});
test('#71 stale quantity, price and deleted line cannot be overwritten',()=>{
 for(const items of [[{...line,quantity:2}],[{...line,price:80}],[]])assert.equal(putCartItem(items,{...line,quantity:3},line),null);
});
test('#71 upgrade atomically replaces product, and distinct options stay distinct',()=>{
 const combo={...line,id:'combo',cartItemId:'new',itemType:'combo',comboSelections:[],price:99};
 assert.equal(putCartItem([line],combo,line).length,1);assert.equal(putCartItem([line],combo,line)[0].id,'combo');
 assert.equal(putCartItem([line],{...line,cartItemId:'two',toppings:[{id:'t',name:'Ost',price:5}]}).length,2);
 assert.equal(putCartItem([{...line,quantity:100}],line),null);
});
test('#71 duplicate and concurrent submissions create one durable consent and job',async()=>{
 const db=database();const ids=await Promise.all([recordNewsletterConsent(db,consent),recordNewsletterConsent(db,consent)]);
 assert.equal(ids[0],ids[1]);assert.equal([...db.rows.keys()].filter(k=>k.startsWith('marketingConsents/')).length,1);
 const event=db.rows.get('marketingConsents/'+ids[0]);assert.equal(event.email,'buyer@example.test');assert.equal(event.channel,'email');assert.equal(event.locationId,'l');assert.equal(event.version,NEWSLETTER_CONSENT_VERSION);assert.match(event.wording,/Fixture via e-mail/);
 assert.equal(db.rows.get('customers/c').marketingConsent,true);assert.equal(db.rows.get('marketingOutbox/'+ids[0]).state,'pending');
 const timestamp=event.capturedAt;await recordNewsletterConsent(db,consent);assert.equal(db.rows.get('marketingConsents/'+ids[0]).capturedAt,timestamp);
});
test('#71 incomplete consent metadata is legacy and cannot claim the current wording',async()=>{
 const db=database();const id=await recordNewsletterConsent(db,{...consent,version:undefined});
 const event=db.rows.get('marketingConsents/'+id);
 assert.equal(event.version,'checkout-email-en-v1');assert.doesNotMatch(event.wording,/Fixture via e-mail/);
});
test('#71 product test-data selection is always included in native form submission',()=>{
 const source=require('node:fs').readFileSync('src/components/superadmin/product-form-page.tsx','utf8');
 assert.match(source,/type="hidden" name="isTestData" value=\{field\.value === true \? 'true' : 'false'\}/);
});
test('#71 consent write is atomic on tenant mismatch and never grants SMS or tracking consent',async()=>{
 const db=database();await assert.rejects(recordNewsletterConsent(db,{...consent,brandId:'other'}),/scope/);assert.equal(db.rows.size,1);
 const payload=consentPayload({...consent,email:'buyer@example.test',id:'event',capturedAt:Date.now(),source:'checkout',channel:'email',wording:'test'});
 assert.equal(payload.identifiers.length,1);assert.deepEqual(Object.keys(payload.identifiers[0].channels),['email']);assert.equal(payload.identifiers[0].sendWelcomeMessage,false);assert.equal(payload.trackingConsents,undefined);
});
test('#71 provider opt-out is never overwritten and account mismatch blocks sending',async()=>{
 let writes=0;
 const provider=new Omnisend(config,async(url,init)=>{if(init.method==='POST')writes++;return Response.json(url.includes('brands/current')?{brandID:'wrong'}:{contacts:[channel('unsubscribed')]});});
 await assert.rejects(provider.verifyBrand(),/mapping_mismatch/);
 assert.equal(await provider.sync({...consent,id:'event',email:'buyer@example.test',capturedAt:0}),'suppressed');assert.equal(writes,0);
});
test('#71 unsubscribe during provider write wins; retries retain original timestamp',async()=>{
 let reads=0;let sent;
 const event={...consent,id:'event',email:'buyer@example.test',capturedAt:1788868800000};
 const provider=new Omnisend(config,async(url,init)=>{if(init.method==='POST'){sent=JSON.parse(init.body);return Response.json({id:'provider'});}return Response.json({contacts:[channel(++reads===1?'nonSubscribed':'unsubscribed')]});});
 assert.equal(await provider.sync(event),'suppressed');assert.equal(sent.identifiers[0].channels.email.statusChangedAt,new Date(event.capturedAt).toISOString());assert.equal(sent.identifiers[0].sendWelcomeMessage,false);
});
test('#71 worker retries without duplicate consent, then records success separately from payment',async()=>{
 process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([config]);
 const db=database(),id=await recordNewsletterConsent(db,consent);let fail=true,calls=0;
 const provider=()=>({verifyBrand:async()=>{},sync:async()=>{calls++;if(fail)throw Error('timeout');return 'synced';},contact:async()=>channel('subscribed')});
 await runMarketingWorker(db,Date.now()+1,provider);let job=db.rows.get('marketingOutbox/'+id);assert.equal(job.state,'failed');assert.ok(job.nextAttemptAt>Date.now());
 fail=false;await runMarketingWorker(db,job.nextAttemptAt+1,provider);job=db.rows.get('marketingOutbox/'+id);assert.equal(job.state,'synced');assert.equal(calls,2);assert.equal([...db.rows.keys()].some(key=>key.startsWith('orders/')),false);
});
test('#71 competing workers lease one job; completed or suppressed jobs cannot be retried',async()=>{
 process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([config]);
 const db=database(),id=await recordNewsletterConsent(db,consent);let calls=0;
 const provider=()=>({verifyBrand:async()=>{},sync:async()=>{calls++;return 'suppressed';},contact:async()=>channel('unsubscribed')});
 await Promise.all([runMarketingWorker(db,Date.now()+1,provider),runMarketingWorker(db,Date.now()+1,provider)]);
 assert.equal(calls,1);assert.equal(db.rows.get('customers/c').marketingConsent,false);assert.equal(await retryMarketingJob(db,'b',id),false);
 await recordNewsletterConsent(db,{...consent,submissionId:undefined});assert.equal(db.rows.get('customers/c').marketingConsent,false);
});
test('#71 missing mapping is actionable and manual retry is scoped',async()=>{
 process.env.ORDERFLY_OMNISEND_BRANDS='[]';const db=database(),id=await recordNewsletterConsent(db,consent);
 await runMarketingWorker(db,Date.now()+1,()=>{throw Error('must not contact provider');});
 assert.equal(db.rows.get('marketingOutbox/'+id).lastError,'configuration_required');
 assert.equal(await retryMarketingJob(db,'other',id),false);assert.equal(await retryMarketingJob(db,'b',id),true);
});
test('#71 disabled mapping reschedules reconciliation so it cannot starve configured brands',async()=>{
 process.env.ORDERFLY_OMNISEND_BRANDS='[]';const db=database(),now=Date.now();
 db.rows.set('marketingContacts/disabled',{brandId:'disabled',customerId:'c',latestEventId:'event',nextReconcileAt:now-1,state:'synced'});
 await runMarketingWorker(db,now,()=>{throw Error('must not contact provider');});
 const contact=db.rows.get('marketingContacts/disabled');assert.equal(contact.nextReconcileAt,now+3600000);assert.equal(contact.updatedAt,now);
});
test('#71 suppressed reconciliation cannot be undone by an old queue event',async()=>{
 process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([config]);const db=database(),id=await recordNewsletterConsent(db,consent);const key=contactKey('b',consent.email);
 let state='subscribed';const provider=()=>({verifyBrand:async()=>{},sync:async()=> 'synced',contact:async()=>channel(state)});
 await runMarketingWorker(db,Date.now()+1,provider);state='unsubscribed';await runMarketingWorker(db,Date.now()+3600001,provider);
 assert.equal(db.rows.get('marketingContacts/'+key).state,'suppressed');assert.equal(db.rows.get('marketingOutbox/'+id).state,'suppressed');assert.equal(db.rows.get('customers/c').marketingConsent,false);
 assert.equal(await retryMarketingJob(db,'b',id),false);
});
test('#71 test products and combos are excluded from restoration and payment validation',()=>{
 const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
 const product={id:'p',brandId:'b',isActive:true,isTestData:true,price:75,locationIds:['l'],productName:'Production-looking name'};
 const result=restoreCartItems([{id:'p',cartItemId:'one',itemType:'product',quantity:1,toppings:[]}],{products:[product],combos:[],groups:[],toppings:[],discounts:[],upsells:[]},{brandId:'b',locationId:'l',deliveryType:'pickup'});
 assert.equal(result.items.length,0);assert.equal(result.removed,1);
});

test('#71 only a fresh explicit grant can renew a dated provider opt-out',async()=>{
 let writes=0,reads=0;const event={...consent,id:'renewed',email:'buyer@example.test',source:'checkout',capturedAt:Date.parse('2026-09-08T12:01:00Z')};
 const provider=new Omnisend(config,async(url,init)=>{if(init.method==='POST'){writes++;return Response.json({id:'provider'});}return Response.json({contacts:[channel(++reads===1?'unsubscribed':'subscribed')]});});
 assert.equal(await provider.sync(event),'synced');assert.equal(writes,1);
 const legacy=new Omnisend(config,async()=>Response.json({contacts:[channel('unsubscribed')]}));
 assert.equal(await legacy.sync({...event,version:'checkout-email-en-v1'}),'suppressed');
 const unknownDate=new Omnisend(config,async()=>Response.json({contacts:[{identifiers:[{type:'email',id:event.email,channels:{email:{status:'unsubscribed'}}}]}]}));
 assert.equal(await unknownDate.sync(event),'suppressed');
});

test('#71 missing required options are rejected after a menu item becomes unavailable',()=>{
 const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
 const result=restoreCartItems([{id:'p',cartItemId:'one',itemType:'product',quantity:1,toppings:[]}],{products:[{id:'p',brandId:'b',isActive:true,price:75,locationIds:['l'],toppingGroupIds:['required']}],combos:[],groups:[{id:'required',locationIds:['l'],minSelection:1,maxSelection:1}],toppings:[],discounts:[],upsells:[]},{brandId:'b',locationId:'l',deliveryType:'pickup'});
 assert.equal(result.items.length,0);assert.equal(result.removed,1);
});
test('#71 SSR menu excludes explicit test data regardless of its public-looking name',async()=>{
 const db={collection:name=>({where(){return this;},async get(){return {docs:name==='categories'?[]:[{id:'real',data:()=>({isActive:true,brandId:'b',price:75})},{id:'hidden',data:()=>({isActive:true,brandId:'b',isTestData:true,productName:'Margherita'})}]};}})};
 const {getMenuForRender}=loadTs('src/lib/server/catalog.ts',{'server-only':{},'next/cache':{unstable_cache:fn=>fn},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/storefront-media':{storefrontMedia:data=>data}});
 const menu=await getMenuForRender({brandId:'b',locationId:'l'});assert.deepEqual(Object.values(menu.productsByCategory).flat().map(p=>p.id),['real']);
});
test('#71 marketing endpoints fail closed without verified credentials',async()=>{
 let token='';let revoked=false;
 const {workerAuthorized,marketingAdminAuthorized}=loadTs('src/lib/marketing/auth.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>token?{value:token}:undefined})},'@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({verifySessionCookie:async(value,checkRevoked)=>{assert.equal(checkRevoked,true);if(revoked)throw Error('revoked');return {uid:value};}})})}});
 delete process.env.ORDERFLY_MARKETING_WORKER_SECRET;assert.equal(workerAuthorized(new Request('https://fixture.test')),false);
 process.env.ORDERFLY_MARKETING_WORKER_SECRET='x'.repeat(32);assert.equal(workerAuthorized(new Request('https://fixture.test',{headers:{authorization:'Bearer '+'x'.repeat(32)}})),true);
 assert.equal(workerAuthorized(new Request('https://fixture.test',{headers:{authorization:'Bearer wrong'}})),false);
 process.env.ORDERFLY_MARKETING_ADMIN_UIDS='allowed';assert.equal(await marketingAdminAuthorized(),false);token='other';assert.equal(await marketingAdminAuthorized(),false);token='allowed';assert.equal(await marketingAdminAuthorized(),true);revoked=true;assert.equal(await marketingAdminAuthorized(),false);
});

test('#71 public recommendations validate restaurant scope and expose only display fields',async()=>{
 let owner='b',reads=0;
 const {POST}=loadTs('src/app/api/public/upsell/route.ts',{'@/lib/url':{getOrigin:async()=> 'https://fixture.test'},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({brandId:owner,isActive:true,deliveryTypes:['pickup']})})})})})},'@/app/superadmin/upsells/actions':{getActiveUpsellForCart:async()=>{reads++;return {upsell:{id:'u',upsellName:'Drink',discountType:'none',triggerConditions:['private'],conversions:42},products:[{id:'drink',internal:'private'}]};}}});
 const body={brandId:'b',locationId:'l',deliveryType:'pickup',cartItems:[],cartTotal:0};
 const request=data=>new Request('https://fixture.test/api/public/upsell',{method:'POST',headers:{origin:'https://fixture.test'},body:JSON.stringify(data)});
 assert.deepEqual(await (await POST(request(body))).json(),{upsell:{id:'u',upsellName:'Drink',discountType:'none'},products:[{id:'drink'}]});
 owner='other';assert.equal((await POST(request(body))).status,404);assert.equal(reads,1);
 assert.equal((await POST(request({...body,cartTotal:-1}))).status,400);
});

test('#71 stale upsell products cannot hide a later scoped public offer',async()=>{
 const offer=id=>({id,brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],offerType:'product',offerProductIds:[id+'-product'],offerCategoryIds:[],triggerConditions:[{type:'cart_value_over',referenceId:'0'}],upsellName:id,discountType:'none'});
 const docs=[offer('stale'),offer('valid')].map(data=>({id:data.id,data:()=>data}));const calls=[];
 const {getActiveUpsellForCart}=loadTs('src/app/superadmin/upsells/actions.ts',{
  '@/lib/promotion-rules':{restaurantClock:()=>({day:'monday',time:'12:00'})},'next/cache':{},'next/navigation':{},'@/lib/upsell-serialization':{},
  '@/lib/firebase-admin':{admin:{firestore:{Timestamp:{now:()=>0,fromDate:d=>d},FieldPath:{documentId:()=>''}}},getAdminDb:()=>({collection:()=>({where(){return this},get:async()=>({docs})})})},
  '../products/actions':{getProductsByIds:async(ids,brandId,locationId)=>{calls.push([ids,brandId,locationId]);return ids[0]==='valid-product'?[{id:'valid-product'}]:[];}},
 });
 const result=await getActiveUpsellForCart({brandId:'b',locationId:'l',deliveryType:'pickup',cartItems:[{id:'cart'}],cartTotal:1});
 assert.equal(result.upsell.id,'valid');assert.deepEqual(calls,[[['stale-product'],'b','l'],[['valid-product'],'b','l']]);
});
test('#71 scoped upsell products preserve brand-wide availability and exclude private inventory',async()=>{
 const products=[
  {id:'global',brandId:'b',isActive:true,locationIds:[]},
  {id:'local',brandId:'b',isActive:true,locationIds:['l']},
  {id:'elsewhere',brandId:'b',isActive:true,locationIds:['other']},
  {id:'test',brandId:'b',isActive:true,isTestData:true,locationIds:[]},
  {id:'inactive',brandId:'b',isActive:false,locationIds:[]},
 ];
 const docs=products.map(data=>({id:data.id,data:()=>data}));
 const {getProductsByIds}=loadTs('src/app/superadmin/products/actions.ts',{
  'server-only':{},'next/cache':{},'next/navigation':{},'firebase-admin':{firestore:{FieldPath:{documentId:()=>''}}},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({where(){return this},get:async()=>({docs})})})},
 });
 const result=await getProductsByIds(products.map(p=>p.id),'b','l');assert.deepEqual(result.map(p=>p.id),['global','local']);
});
test('#71 inline upsell always uses the best eligible unit price',()=>{
 const {productPriceData}=loadTs('src/lib/product-price.ts');
 const product={id:'drink',brandId:'b',categoryId:'beverage',price:90,basePrice:100};
 const discount=(id,value,type='product',referenceIds=['drink'])=>({id,discountMethod:'percentage',discountValue:value,discountType:type,referenceIds});
 assert.equal(productPriceData(product,[discount('better',20)],'pickup').finalPrice,80);
 assert.equal(productPriceData(product,[discount('worse',5)],'pickup').finalPrice,90);
 assert.equal(productPriceData(product,[discount('category',25,'category',['beverage'])],'pickup').finalPrice,75);
 assert.equal(productPriceData(product,[{...discount('quantity',50),discountMethod:'buy_x_pay_y'}],'pickup').finalPrice,90);
});

test('#71 actual checkout stores explicit consent before Stripe and retains it if payment fails',async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');
 for(const failStripe of [false,true]) {
  const f=await checkout({customerOverrides:{subscribeToNewsletter:true,newsletterConsentId:consent.submissionId,newsletterConsentVersion:NEWSLETTER_CONSENT_VERSION},...(failStripe?{stripeError:{type:'StripeConnectionError'}}:{})});
  assert.equal(f.result.success,!failStripe,f.result.error);assert.ok(f.events.indexOf('newsletter-consent')<f.events.indexOf('stripe'));
  assert.equal([...f.records.keys()].filter(key=>key.startsWith('marketingConsents/')).length,1);assert.equal([...f.records.keys()].filter(key=>key.startsWith('marketingOutbox/')).length,1);
 }
 const unchecked=await checkout();assert.equal(unchecked.result.success,true,unchecked.result.error);assert.equal(unchecked.events.includes('newsletter-consent'),false);
 const existing=await checkout({seed:[['customers/c',{id:'c',brandId:'b',normalizedEmail:'test@example.test',email:'test@example.test',marketingConsent:true}]]});assert.equal(existing.result.success,true,existing.result.error);assert.equal(existing.records.get('customers/c').marketingConsent,true);
 const failed=await checkout({customerOverrides:{subscribeToNewsletter:true},fault:'newsletter-consent'});assert.equal(failed.result.success,false);assert.equal(failed.result.retryable,true);assert.match(failed.result.error,/Tilmeldingen kunne ikke gemmes/);assert.equal(failed.events.includes('stripe'),false);
});
