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
 '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw Error('forbidden');}},
 '@/lib/firebase-admin':{getAdminDb:()=>db},
 '@/lib/payments/worldline-settings':exportsObject,
 '@/lib/payments/worldline-store':{worldlineSettingsRef:s=>ref('settings/'+s.brandId+'/'+(s.locationId||'')),readWorldlineSecret:async(s,m,r)=>secrets.get(r),writeWorldlineSecret:async(s,m,v)=>{const r='private-'+(++counter);secrets.set(r,v);return r;}}
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/superadmin/payments/worldline-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:actionExports,require:name=>mocks[name]||require(name)});
 return {actions:actionExports,records,secrets,deny:()=>allowed=false};
}
const blank={merchantNumber:'',accessToken:'',secretToken:'',md5Key:''};
test('actions enforce authority and location ownership before credential writes',async()=>{
 const f=actionFixture();await assert.rejects(f.actions.loadWorldlineSettings({brandId:'b',locationId:'other'}));
 f.deny();await assert.rejects(f.actions.saveWorldlineSettings({brandId:'b'},{source:'own',mode:'test',test:testKeys,live:blank,revision:0}));assert.equal(f.secrets.size,0);
});
test('saved views expose flags only and stale saves cannot replace configuration',async()=>{
 const f=actionFixture();const data={source:'own',mode:'test',test:testKeys,live:blank,revision:0};
 const view=await f.actions.saveWorldlineSettings({brandId:'b'},data);
 assert.equal(view.testSet,true);assert.equal(view.liveSet,false);
 assert.doesNotMatch(JSON.stringify(view),/test-secret|test-access|test-hash|private-/);
 assert.doesNotMatch(JSON.stringify([...f.records]),/test-secret|test-access|test-hash/);
 await assert.rejects(f.actions.saveWorldlineSettings({brandId:'b'},data));assert.equal(f.secrets.size,1);
 await assert.rejects(f.actions.saveWorldlineSettings({brandId:'b'},{...data,test:blank,mode:'live',revision:1}));
 assert.equal(f.records.get('settings/b/').mode,'test');
});
