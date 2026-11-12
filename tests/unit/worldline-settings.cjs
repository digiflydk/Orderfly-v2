const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payments/worldline-settings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,require});
const {mergeWorldlineCredentials,validateWorldlineCredentials,selectWorldlineAgreement,worldlineScopeSchema}=exportsObject;
const testKeys={merchantNumber:'T123',accessToken:'test-access',secretToken:'test-secret',md5Key:'test-hash'};
test('blank fields preserve saved credentials; changing one secret preserves others',()=>{
 const result=mergeWorldlineCredentials({merchantNumber:'',accessToken:'',secretToken:'replacement',md5Key:''},testKeys);
 assert.equal(result.merchantNumber,'T123');assert.equal(result.secretToken,'replacement');assert.equal(result.md5Key,'test-hash');
});
test('incomplete or wrong-environment agreements cannot be selected',()=>{
 assert.doesNotThrow(()=>validateWorldlineCredentials(testKeys,'test'));
 assert.throws(()=>validateWorldlineCredentials(testKeys,'live'));
 assert.throws(()=>validateWorldlineCredentials({...testKeys,secretToken:''},'test'));
});
test('own location never falls back to brand, even when disabled or incomplete',()=>{
 const brand={source:'own',mode:'live',live:'brand-secret',revision:1};
 const local={source:'own',mode:'test',revision:1};
 assert.equal(selectWorldlineAgreement(brand,local),local);
 assert.equal(selectWorldlineAgreement(brand,{...local,mode:'disabled'}).mode,'disabled');
 assert.equal(selectWorldlineAgreement(brand,{source:'brand',mode:'disabled',revision:1}),brand);
 assert.equal(selectWorldlineAgreement(brand,null),brand);
});
test('scope rejects path injection and extra properties',()=>{
 assert.equal(worldlineScopeSchema.safeParse({brandId:'a/b'}).success,false);
 assert.equal(worldlineScopeSchema.safeParse({brandId:'a',projectId:'other'}).success,false);
});
function actionFixture(){
 let allowed=true;const records=new Map([['brands/b',{}],['locations/l',{brandId:'b'}]]), secrets=new Map();let counter=0;
 const ref=path=>({get:async()=>({exists:records.has(path),data:()=>records.get(path)}),path});
 const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async run=>run({get:r=>r.get(),set:(r,v)=>records.set(r.path,v)})};
 const actionExports={};
 const mocks={
 '@/lib/payments/worldline-api-key':require('../helpers/load-ts.cjs').loadTs('src/lib/payments/worldline-api-key.ts',{'server-only':{}}),
 '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw Object.assign(Error('forbidden'),{status:403});}},
 '@/lib/firebase-admin':{getAdminDb:()=>db},
 '@/lib/payments/worldline-settings':exportsObject,
 '@/lib/payments/worldline-store':{readStripeSecret:async(s,m,r)=>secrets.get(r),writeStripeSecret:async(s,m,v)=>{const r='stripe-private-'+(++counter);secrets.set(r,v);return r;},worldlineSettingsRef:s=>ref('settings/'+s.brandId+'/'+(s.locationId||'')),readWorldlineSecret:async(s,m,r)=>secrets.get(r),writeWorldlineSecret:async(s,m,v)=>{const r='private-'+(++counter);secrets.set(r,v);return r;}}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/superadmin/payments/worldline-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:actionExports,require:name=>mocks[name]||require(name)});
 return {actions:actionExports,records,secrets,deny:()=>allowed=false};
}
const blank={merchantNumber:'',accessToken:'',secretToken:'',md5Key:''};
test('actions enforce authority and location ownership before credential writes',async()=>{
 const f=actionFixture();await assert.rejects(f.actions.loadWorldlineSettings({brandId:'b',locationId:'other'}));
 f.deny();const denied=await f.actions.saveWorldlineSettings({brandId:'b'},{source:'own',provider:'worldline',mode:'test',test:testKeys,live:blank,revision:0});assert.equal(denied.ok,false);assert.equal(denied.code,'FORBIDDEN');assert.equal(f.secrets.size,0);
});
test('saved views expose flags only and stale saves cannot replace configuration',async()=>{
 const f=actionFixture();const data={source:'own',provider:'worldline',mode:'test',test:testKeys,live:blank,revision:0};
 const saved=await f.actions.saveWorldlineSettings({brandId:'b'},data);assert.equal(saved.ok,true);const view=saved.settings;
 assert.equal(view.testSet,true);assert.equal(view.liveSet,false);
 assert.doesNotMatch(JSON.stringify(view),/test-secret|test-access|test-hash|private-/);
 assert.doesNotMatch(JSON.stringify([...f.records]),/test-secret|test-access|test-hash/);
 const stale=await f.actions.saveWorldlineSettings({brandId:'b'},data);assert.equal(stale.ok,false);assert.equal(stale.code,'REVISION_CONFLICT');assert.equal(f.secrets.size,1);
 const incomplete=await f.actions.saveWorldlineSettings({brandId:'b'},{...data,test:blank,mode:'live',revision:1});assert.equal(incomplete.ok,false);
 assert.equal(f.records.get('settings/b/').mode,'test');
});
test('provider preference persists and inherits without changing legacy defaults',async()=>{
 const f=actionFixture();
 const initial=await f.actions.loadWorldlineSettings({brandId:'b'});assert.equal(initial.provider,'stripe');
 assert.equal((await f.actions.saveWorldlineSettings({brandId:'b'},{source:'own',provider:'worldline',mode:'test',test:testKeys,live:blank,revision:0})).ok,true);
 const local=await f.actions.loadWorldlineSettings({brandId:'b',locationId:'l'});
 assert.equal(local.source,'brand');assert.equal(local.brandProvider,'worldline');
});

test('Stripe-only agreements save without Worldline keys and preserve separate environments',async()=>{
 const f=actionFixture();const keys={secretKey:'sk_test_synthetic',publishableKey:'pk_test_synthetic',webhookSecret:'whsec_synthetic'};
 const value={source:'own',provider:'stripe',mode:'test',revision:0,test:blank,live:blank,stripeTest:keys};
 const saved=await f.actions.saveWorldlineSettings({brandId:'b'},value);assert.equal(saved.ok,true);const view=saved.settings;assert.equal(view.stripeTestSet,true);assert.equal(view.testSet,false);assert.equal(f.records.get('settings/b/').provider,'stripe');assert.doesNotMatch(JSON.stringify(view),/sk_test|whsec_|private/);
 assert.equal((await f.actions.saveWorldlineSettings({brandId:'b'},{...value,revision:1,stripeTest:{secretKey:'',publishableKey:'',webhookSecret:''}})).ok,true);
 assert.equal(f.secrets.size,1);
 const wrongMode=await f.actions.saveWorldlineSettings({brandId:'b'},{...value,mode:'live',revision:2});assert.equal(wrongMode.ok,false);assert.equal(wrongMode.code,'STRIPE_CREDENTIALS_INVALID');
});
