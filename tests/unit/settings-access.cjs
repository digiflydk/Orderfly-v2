const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{loadTs}=require('../helpers/load-ts.cjs');
test('settings reads and mutations deny before touching platform data',async()=>{
 let reads=0;
 const api=loadTs('src/app/superadmin/settings/actions.ts',{'server-only':{},'next/cache':{},'@/lib/firebase-admin':{getAdminDb:()=>{reads++;throw Error('unexpected');}},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{throw Error('forbidden');}},'./queries':{getPlatformBrandingSettings:async()=>null}});
 await assert.rejects(api.getPlatformSettings(),/forbidden/);
 for(const name of ['updatePaymentGatewaySettings','updateLanguageSettings','updateBrandingSettings'])await assert.rejects(api[name](null,new FormData()),/forbidden/);
 assert.equal(reads,0);
});
test('private payment readers are server-only modules and are no longer remotely callable actions',()=>{
 const actions=fs.readFileSync('src/app/superadmin/settings/actions.ts','utf8'),internal=fs.readFileSync('src/lib/server/payment-settings.ts','utf8');
 assert.doesNotMatch(actions,/export async function getActiveStripe(?:SecretKey|WebhookSecret)/);
 assert.match(internal,/^import 'server-only';/);assert.doesNotMatch(internal,/^['"]use server['"]/m);
});
test('logo updates merge only the active field and retain payment settings and languages',async()=>{
 const writes=[],reads=[];
 const payment={activeMode:'test',test:{publishableKey:'fixture-public',secretKey:'fixture-private'},live:{publishableKey:'',secretKey:''}};
 const languages={supportedLanguages:[{code:'da',name:'Dansk'}]};
 const api=loadTs('src/app/superadmin/settings/actions.ts',{'server-only':{},'next/cache':{revalidatePath:()=>{}},
  '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{}},'./queries':{getPlatformBrandingSettings:async()=>({platformLogoUrl:null})},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:id=>({get:async()=>{reads.push(id);return {exists:true,data:()=>id==='payment_gateway'?payment:languages};},set:async(value,options)=>writes.push({id,value,options})})})})},
 });
 const form=new FormData();form.set('platformLogoUrl','https://example.com/logo.png');form.set('platformHeading','Ignored');
 assert.equal((await api.updateBrandingSettings(null,form)).error,false);
 assert.deepEqual(writes,[{id:'branding',value:{platformLogoUrl:'https://example.com/logo.png'},options:{merge:true}}]);
 const result=await api.getPlatformSettings();assert.deepEqual(result.paymentGatewaySettings,{activeMode:'test',test:{publishableKey:'fixture-public',secretKeySet:true,webhookSecretSet:false},live:{publishableKey:'',secretKeySet:false,webhookSecretSet:false}});assert.doesNotMatch(JSON.stringify(result),/fixture-private/);assert.deepEqual(result.languageSettings,languages);assert.deepEqual(reads,['payment_gateway','languages']);assert.equal(result.analyticsSettings,undefined);
});
test('#57 Stripe secrets are write-only: never returned, kept when left empty, replaced only when typed',async()=>{
 const stored={activeMode:'live',test:{publishableKey:'pk_test',secretKey:'sk_test_stored',webhookSecret:'whsec_test_stored'},live:{publishableKey:'pk_live',secretKey:'sk_live_stored',webhookSecret:'whsec_live_stored'}};
 const writes=[];
 const api=loadTs('src/app/superadmin/settings/actions.ts',{'server-only':{},'next/cache':{revalidatePath:()=>{}},
  '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{}},'./queries':{getPlatformBrandingSettings:async()=>null},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:id=>({get:async()=>({exists:id==='payment_gateway',data:()=>id==='payment_gateway'?stored:undefined}),set:async value=>writes.push(value)})})})},
 });
 const view=await api.getPlatformSettings();
 assert.doesNotMatch(JSON.stringify(view),/sk_test_stored|sk_live_stored|whsec_/);
 assert.deepEqual(view.paymentGatewaySettings.live,{publishableKey:'pk_live',secretKeySet:true,webhookSecretSet:true});
 const form=new FormData();form.set('activeMode','live');
 for(const [k,v] of Object.entries({'test.publishableKey':'pk_test','test.secretKey':'','test.webhookSecret':'','live.publishableKey':'pk_live','live.secretKey':'','live.webhookSecret':'whsec_live_new'}))form.set(k,v);
 assert.equal((await api.updatePaymentGatewaySettings(null,form)).error,false);
 assert.deepEqual(writes.at(-1),{activeMode:'live',test:{publishableKey:'pk_test',secretKey:'sk_test_stored',webhookSecret:'whsec_test_stored'},live:{publishableKey:'pk_live',secretKey:'sk_live_stored',webhookSecret:'whsec_live_new'}});
});
