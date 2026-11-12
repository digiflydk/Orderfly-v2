const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
function fixture(){
 const rows=new Map([['brands/b',{}],['locations/l',{brandId:'b'}],['locations/foreign',{brandId:'other'}]]),db=memoryDb(rows),secrets=new Map(),accesses=[];
 const requests=[];let signedEvent;let signatureValid=true;
 class Stripe{constructor(key){this.key=key;requests.push(key);}webhooks={constructEventAsync:async(raw,sig,key)=>{assert.equal(sig,'signed');if(!signatureValid)throw Error('bad signature');assert.equal(key,'whsec_old');return signedEvent;}};}
 class SecretManager{async accessSecretVersion({name}){accesses.push(name);if(!secrets.has(name))throw Error('secret unavailable');return [{payload:{data:Buffer.from(JSON.stringify(secrets.get(name)))}}];}}
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminApp:()=>({options:{projectId:'orderfly-39325'}})},'@google-cloud/secret-manager':{SecretManagerServiceClient:SecretManager},stripe:{default:Stripe},'@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>rows.get('platform_settings/payment_gateway')?.test?.secretKey||null}});
 const store=load('src/lib/payments/worldline-store.ts'),agreement=load('src/lib/payments/merchant-agreement.ts'),order=load('src/lib/payments/stripe-order.ts');
 function config(scope,{source='own',provider='stripe',mode='test',revision=1,...extra}={}){rows.set(`platform_settings/worldline-${store.worldlineSettingsId(scope)}`,{source,provider,mode,revision,...extra});}
 function bundle(scope,mode='test',version=1,label='old') {const ref=`projects/orderfly-39325/secrets/orderfly-stripe-${store.worldlineSettingsId(scope)}-${mode}/versions/${version}`;const credentials={secretKey:`sk_${mode}_${label}`,publishableKey:`pk_${mode}_${label}`,webhookSecret:`whsec_${label}`};secrets.set(ref,credentials);return ref;}
 function session(o={}){return {id:'cs_test_12345678',mode:'payment',status:'complete',payment_status:'paid',currency:'dkk',amount_total:12500,livemode:false,metadata:{orderId:'o',brandId:'b',locationId:'l'},...o};}
 return {rows,db,secrets,accesses,requests,store,agreement,order,config,bundle,session,event:value=>signedEvent=value,denySignature:()=>signatureValid=false};
}
test('brand inheritance and own locations select an indivisible Stripe bundle without fallback',async()=>{
 const f=fixture(),brand=f.bundle({brandId:'b'}),local=f.bundle({brandId:'b',locationId:'l'},'test',1,'local');
 f.config({brandId:'b'},{stripeTest:brand});
 let selected=await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'});assert.equal(selected.binding.reference,brand);assert.equal(selected.binding.owner.locationId,undefined);
 f.config({brandId:'b',locationId:'l'},{source:'brand'});selected=await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'});assert.equal(selected.binding.reference,brand);
 f.config({brandId:'b',locationId:'l'},{stripeTest:local});selected=await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'});assert.equal(selected.binding.reference,local);assert.equal(selected.credentials.secretKey,'sk_test_local');
 f.config({brandId:'b',locationId:'l'},{});await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}),/mangler/);
 f.config({brandId:'b',locationId:'l'},{mode:'disabled'});await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}),/deaktiveret/);
});
test('unknown provider, missing inherited brand, foreign scope and crossed test/live fail before credential access',async()=>{
 const f=fixture();assert.equal(await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}),null);
 f.config({brandId:'b',locationId:'l'},{source:'brand'});await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}),/mangler/);
 await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'foreign'}),/Ugyldig/);
 f.config({brandId:'b',locationId:'l'},{provider:'unknown'});await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}));
 f.config({brandId:'b',locationId:'l'},{mode:'live',stripeLive:f.bundle({brandId:'b',locationId:'l'},'test')});await assert.rejects(f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'}));assert.equal(f.accesses.length,0);
});
test('pinned merchant version survives settings rotation and never uses another location or current global key',async()=>{
 const f=fixture(),old=f.bundle({brandId:'b'});f.config({brandId:'b'},{stripeTest:old});const selected=await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'});
 const order={brandId:'b',locationId:'l',psp:{provider:'stripe'},paymentAgreement:selected.binding};
 f.config({brandId:'b'},{stripeTest:f.bundle({brandId:'b'},'test',2,'new'),revision:2});f.rows.set('platform_settings/payment_gateway',{test:{secretKey:'sk_test_global'}});
 assert.equal((await f.order.stripeForOrder(order)).key,'sk_test_old');assert.equal(f.requests.at(-1),'sk_test_old');
 await assert.rejects(f.order.stripeForOrder({...order,brandId:'other'}));
 const local=await f.agreement.readPinnedStripeAgreement({...selected.binding,owner:{brandId:'b',locationId:'l'}}).then(()=>true,()=>false);assert.equal(local,false);
 await assert.rejects(f.order.stripeForOrder({...order,paymentAgreement:null}));
 f.secrets.delete(old);await assert.rejects(f.order.stripeForOrder(order));assert.equal(f.requests.includes('sk_test_global'),false);
});
test('legacy snapshots are immutable, scoped, environment-specific and keep historic keys after global rotation',async()=>{
 const f=fixture();f.rows.set('platform_settings/payment_gateway',{activeMode:'test',test:{secretKey:'sk_test_old',publishableKey:'pk_test_old',webhookSecret:'whsec_old'},live:{secretKey:'sk_live_live',publishableKey:'pk_live_live',webhookSecret:'whsec_live'}});
 const first=await f.agreement.resolveLegacyStripeAgreement({brandId:'b',locationId:'l'}),repeat=await f.agreement.resolveLegacyStripeAgreement({brandId:'b',locationId:'l'});assert.equal(first.binding.reference,repeat.binding.reference);assert.match(first.binding.reference,/platform_settings\/stripe-legacy-/);assert.equal(f.accesses.length,0);
 f.rows.get('platform_settings/payment_gateway').test.secretKey='sk_test_new';assert.equal((await f.agreement.readPinnedStripeAgreement(first.binding)).credentials.secretKey,'sk_test_old');
 const current=await f.agreement.resolveLegacyStripeAgreement({brandId:'b',locationId:'l'});assert.notEqual(current.binding.reference,first.binding.reference);
 await assert.rejects(f.agreement.readPinnedStripeAgreement({...first.binding,owner:{brandId:'other',locationId:'l'}}));
 await assert.rejects(f.agreement.readPinnedStripeAgreement({...first.binding,mode:'live'}));
 const live=await f.agreement.resolveLegacyStripeAgreement({brandId:'b',locationId:'l'},'live');assert.equal(live.credentials.secretKey,'sk_live_live');
 f.rows.get(first.binding.reference).credentials.secretKey='sk_test_tampered';await assert.rejects(f.agreement.readPinnedStripeAgreement(first.binding));
});
test('session observations reject wrong account environment, tenant, amount, currency, session and fake free order',()=>{
 const f=fixture(),binding={provider:'stripe',mode:'test',owner:{brandId:'b'},reference:f.bundle({brandId:'b'}),revision:1};const order={brandId:'b',locationId:'l',totalAmount:125,paymentAgreement:binding,psp:{provider:'stripe',checkoutSessionId:'cs_test_12345678'}};
 assert.equal(f.order.assertStripeOrderSession('o',order,f.session()).id,'cs_test_12345678');
 for(const patch of [{livemode:true},{currency:'eur'},{amount_total:1},{id:'cs_test_other'},{metadata:{orderId:'other',brandId:'b',locationId:'l'}},{payment_status:'no_payment_required'}])assert.throws(()=>f.order.assertStripeOrderSession('o',order,f.session(patch)));
});
test('pinned webhook uses original signing secret and rejects bad signatures, wrong event scope or environment',async()=>{
 const f=fixture(),ref=f.bundle({brandId:'b'});f.config({brandId:'b'},{stripeTest:ref});const selected=await f.agreement.resolveMerchantAgreement({brandId:'b',locationId:'l'});f.rows.set('orders/o',{brandId:'b',locationId:'l',totalAmount:125,paymentAgreement:selected.binding,psp:{provider:'stripe',checkoutSessionId:'cs_test_12345678'}});
 const session=f.session(),raw=JSON.stringify({data:{object:session}});f.event({type:'checkout.session.completed',livemode:false,data:{object:session}});assert.equal((await f.order.verifyPinnedStripeWebhook(raw,'signed')).type,'checkout.session.completed');assert.equal(f.requests.at(-1),'sk_test_old');
 f.event({type:'checkout.session.completed',livemode:true,data:{object:session}});await assert.rejects(f.order.verifyPinnedStripeWebhook(raw,'signed'));
 f.event({type:'checkout.session.completed',livemode:false,data:{object:f.session({metadata:{orderId:'o',brandId:'other',locationId:'l'}})}});await assert.rejects(f.order.verifyPinnedStripeWebhook(raw,'signed'));
 f.denySignature();await assert.rejects(f.order.verifyPinnedStripeWebhook(raw,'signed'));
});
