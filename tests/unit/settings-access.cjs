const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{loadTs}=require('../helpers/load-ts.cjs');
test('settings reads and mutations deny before touching platform data',async()=>{
 let reads=0;
 const api=loadTs('src/app/superadmin/settings/actions.ts',{'server-only':{},'next/cache':{},'@/lib/firebase-admin':{getAdminDb:()=>{reads++;throw Error('unexpected');}},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{throw Error('forbidden');}},'./queries':{getPlatformBrandingSettings:async()=>null}});
 await assert.rejects(api.getPlatformSettings(),/forbidden/);
 for(const name of ['updateAnalyticsSettings','updatePaymentGatewaySettings','updateLanguageSettings','updateBrandingSettings'])await assert.rejects(api[name](null,new FormData()),/forbidden/);
 assert.equal(reads,0);
});
test('private payment readers are server-only modules and are no longer remotely callable actions',()=>{
 const actions=fs.readFileSync('src/app/superadmin/settings/actions.ts','utf8'),internal=fs.readFileSync('src/lib/server/payment-settings.ts','utf8');
 assert.doesNotMatch(actions,/export async function getActiveStripe(?:SecretKey|WebhookSecret)/);
 assert.match(internal,/^import 'server-only';/);assert.doesNotMatch(internal,/^['"]use server['"]/m);
});
