const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
class Reply extends Response {cookies={set:(name,value,options)=>{this.cookie={name,value,options};}};static json(value,init){return new Reply(JSON.stringify(value),init);}}
for(const name of ['list','download','bundle'])test(`internal docs ${name} authorizes before file IO`,async()=>{
 let allowed=false,reads=0;
 const route=loadTs(`src/app/api/docs/${name}/route.ts`,{'server-only':{},'next/server':{NextResponse:Reply},'node:path':{default:require('node:path')},
  '@/lib/auth/superadmin-api':{requireSuperadminApi:async()=>allowed?null:Reply.json({error:'forbidden'},{status:403})},
  '@/lib/docs/whitelist':{DOC_WHITELIST:['security.md'],DOCS_DIR:'docs',isAllowedDoc:name=>name==='security.md'},
  'node:fs/promises':{readFile:async()=>{reads++;return 'private fixture';}},
 });
 const req=()=>new Request('https://fixture.test/?name=security.md');
 assert.equal((await route.GET(req())).status,403);assert.equal(reads,0);
 allowed=true;assert.equal((await route.GET(req())).status,200);assert.equal(reads,name==='list'?0:1);
 if(name==='download')assert.equal((await route.GET(new Request('https://fixture.test/?name=../secret'))).status,400);
});
function consentFixture(){
 let cookie;const records=new Map([['brands/b',{isActive:true}],['anonymous_cookie_consents/11111111-1111-4111-8111-111111111111',{marketing:false,linked_to_customer:true}]]);
 const snapshot=path=>({exists:records.has(path),data:()=>structuredClone(records.get(path))});
 const identity=loadTs('src/lib/server/consent-identity.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})}});
 const route=loadTs('src/app/api/consent/save-anonymous/route.ts',{'@/lib/server/consent-identity':identity,'next/server':{NextResponse:Reply},'next/headers':{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})},'@/lib/url':{getOrigin:async()=> 'https://fixture.test'},
 '@/lib/firebase-admin':{getAdminFieldValue:()=>({serverTimestamp:()=> 'now'}),getAdminDb:()=>({collection:c=>({doc:id=>c+'/'+id}),runTransaction:async run=>{const writes=[];const result=await run({get:async ref=>snapshot(ref),set:(ref,value)=>writes.push([ref,value])});for(const [ref,value]of writes)records.set(ref,{...records.get(ref),...value});return result;}})},
 });
 const input={anon_user_id:'11111111-1111-4111-8111-111111111111',marketing:true,statistics:true,functional:true,necessary:true,consent_version:'v1',origin_brand:'b',brand_id:'b',shared_scope:'orderfly'};
 return{records,input,setCookie:value=>{cookie=value;},post:(body=input,origin='https://fixture.test')=>route.POST(new Request('https://fixture.test/api/consent/save-anonymous',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}))};
}
test('consent UUID cannot claim another browser record; server cookie binds updates and revocations',async()=>{
 const f=consentFixture(),first=await f.post();assert.equal(first.status,200);
 const id=(await first.json()).anon_user_id;assert.notEqual(id,f.input.anon_user_id);assert.equal(first.cookie.options.httpOnly,true);
 assert.equal(f.records.get('anonymous_cookie_consents/'+f.input.anon_user_id).marketing,false);
 f.setCookie(first.cookie.value);assert.equal((await f.post({...f.input,marketing:false,statistics:false})).status,200);
 assert.equal(f.records.get('anonymous_cookie_consents/'+id).marketing,false);
 f.setCookie(id+'.'+'a'.repeat(64));const before=structuredClone(f.records);assert.equal((await f.post()).status,403);assert.deepEqual(f.records,before);
});
test('consent rejects cross-origin, unknown brand and invalid shape without writes',async()=>{
 const f=consentFixture(),before=structuredClone(f.records);
 assert.equal((await f.post(f.input,'https://foreign.test')).status,403);
 assert.equal((await f.post({...f.input,brand_id:'missing'})).status,403);
 assert.equal((await f.post({...f.input,linked_to_customer:true})).status,400);
 assert.deepEqual(f.records,before);
});
test('stale browser upsell action cannot touch Admin SDK',async()=>{
 const api=loadTs('src/app/superadmin/upsells/actions.ts',{'@/lib/access/orderfly-session':{},'@/lib/access/scoped-data':{},'@/lib/access/location-catalog':{},'@/lib/promotion-rules':{},'@/lib/upsell-serialization':{},'next/cache':{},'next/navigation':{},'../products/actions':{},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('unexpected write');}}});
 assert.deepEqual(await api.incrementUpsellConversion('foreign'),{success:false});
});
test('claimed upsell is accepted only when native offer scope, product and trigger match',()=>{
 const {validateCheckoutPrices}=loadTs('src/lib/checkout-price-validation.ts');
 const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-09-25T12:00:00Z')};
 const items=[{id:'trigger',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100},{id:'offer',name:'Drink',quantity:1,unitPrice:20,totalPrice:20,upsellId:'u'}];
 const catalog=[{id:'trigger',tags:[],isCombo:false,price:100},{id:'offer',tags:[],isCombo:false,price:20}];
 const offer={id:'u',brandId:'b',locationIds:['l'],orderTypes:['pickup'],isActive:true,offerType:'product',offerProductIds:['offer'],offerCategoryIds:[],discountType:'none',discountValue:0,triggerConditions:[{type:'product_in_cart',referenceId:'trigger'}]};
 assert.deepEqual(validateCheckoutPrices(items,catalog,[],[offer],scope),['u']);
 for(const change of [{brandId:'foreign'},{locationIds:['foreign']},{offerProductIds:['foreign']},{triggerConditions:[]},{isActive:false}])assert.deepEqual(validateCheckoutPrices(items,catalog,[],[{...offer,...change}],scope),[]);
 assert.deepEqual(validateCheckoutPrices(items,catalog,[],[],scope),[]);
});
test('public website projection excludes internal AI prompts and future private fields',()=>{
 const {publicGeneralSettings}=loadTs('src/lib/public-general-settings.ts');
 assert.deepEqual(publicGeneralSettings({websiteTitle:'Fixture',logoUrl:'/logo.png',aiSystemPrompt:'private',aiSystemPromptOpenAI:'private',aiProvider:'openai',aiModel:'private',futureSecret:'private'}),{websiteTitle:'Fixture',logoUrl:'/logo.png'});
});

test('older consent request cannot reverse a newer withdrawal at the database',async()=>{
 const f=consentFixture(),first=await f.post({...f.input,choice_revision:1});const id=(await first.json()).anon_user_id;f.setCookie(first.cookie.value);
 await f.post({...f.input,marketing:false,choice_revision:3});await f.post({...f.input,marketing:true,choice_revision:2});
 assert.equal(f.records.get('anonymous_cookie_consents/'+id).marketing,false);
});
