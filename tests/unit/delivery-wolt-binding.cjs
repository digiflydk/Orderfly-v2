const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy } = require('../helpers/printing-fixture.cjs');
const schema = loadTs('src/lib/delivery/settings/schema.ts');
const schedule = loadTs('src/lib/delivery/settings/schedule.ts');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
function fixture(options = {}) {
  const p = policy(['orderfly.catalog:view', ...(options.readonly ? [] : ['orderfly.catalog:edit'])]);
  if (!options.locationOnly) p.memberships[0].locationIds = null;
  const records = new Map([['platformAdminControl/access-v1',p],['brands/brand',{}],['locations/location',{brandId:'brand'}],['locations/foreign',{brandId:'other'}]]);
  const ref = path => ({path,id:path.split('/').at(-1),collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
  let chain=Promise.resolve(),retried=false; const commits=[];
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction(run){const pending=chain.then(async()=>{for(;;){const staged=new Map(structuredClone([...records]));let writing=false;const writes=[];
    const tx={async get(r){assert.equal(writing,false);return {id:r.id,exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))};},create(r,v){writing=true;if(options.failAudit&&r.path.includes('/audit/'))throw Error('PRIVATE');assert.equal(staged.has(r.path),false);staged.set(r.path,v);writes.push(r.path);},set(r,v){writing=true;staged.set(r.path,v);writes.push(r.path);}};
    const result=await run(tx);if(options.retry&&!retried){retried=true;options.retry(records);continue;}records.clear();for(const row of staged)records.set(...row);commits.push(writes);return result;}});chain=pending.catch(()=>{});return pending;}};
  const mocks={'server-only':{},'@/lib/access/authority':authority,'./authority':authority,'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>({serverTimestamp:true})})},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>{if(options.anonymous)throw new authority.AuthorityError('unauthorized',401);return {provider:'firebase',subject:'writer'};}},'./wolt-customer-quote':{inspectCustomerWoltQuoteCapability:()=>{throw new authority.AuthorityError('forbidden');},authorizeCustomerWoltQuoteInTransaction:async()=>{throw new authority.AuthorityError('forbidden');}},'../booking/dispatcher':{inspectWoltDispatchCapability:()=>{throw new authority.AuthorityError('forbidden');},authorizeWoltDispatchInTransaction:async()=>{throw new authority.AuthorityError('forbidden');}},'@google-cloud/secret-manager':{SecretManagerServiceClient:class {constructor(){options.onSecretClient?.();}async accessSecretVersion(){if(options.secretHook)options.secretHook(records);if(options.secretError)throw Error('PRIVATE_SECRET');return [{payload:{data:Buffer.from('sandbox_test_key_not_real_123')}}];}}},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'}};
  return {records,commits,settings:loadTs('src/lib/delivery/settings/server.ts',mocks),service:loadTs('src/lib/delivery/integrations/wolt-binding.ts',mocks)};
}
const scope={brandId:'brand',locationId:'location'};
const config={schemaVersion:1,...scope,provider:'wolt',environment:'sandbox',active:true,revision:1,merchantId:'merchant',venueId:'venue',secretRef:'projects/test-project/secrets/orderfly-wolt-sandbox-merchant/versions/1'};
function prepared(options={}){const f=fixture(options);const key=`deliveryProviderBindings/${f.service.woltBindingDocumentId(scope,'sandbox')}`;f.records.set(key,structuredClone(config));const merchantKey='deliveryWoltMerchants/'+f.service.woltMerchantDocumentId('sandbox','merchant');f.records.set(merchantKey,{version:1,environment:'sandbox',merchantId:'merchant',...scope,venueId:'venue',callbackId:'a'.repeat(64),active:true});return {...f,key,merchantKey};}
function quote(){const at=new Date().toISOString();return {scope,quoteRef:'native/quote:1',fingerprint:'a'.repeat(64),bindingRevision:'1',merchantId:'merchant',venueId:'venue',environment:'sandbox',cost:{amountMinor:2500,currency:'DKK',taxBasis:'inclusive',taxMinor:null},native:{promiseId:'native/quote:1',venueId:'venue',validUntil:null,fetchedAt:at,dropoff:{coordinates:{lat:55.6,lon:12.5},formattedAddress:'Test Street 1'},scheduledDropoffTime:null,preparationMinutes:5}};}
test('native operator authority and exact scope/current environment bind storage',async()=>{
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox');
 assert.equal((await a.resolveBinding(scope,'wolt')).revision,'1');assert.equal(await a.authorizeScope({...scope,locationId:'foreign'}),false);
 await assert.rejects(f.service.createAuthorizedWoltStorage(scope,'production'),/binding_unavailable/);
 f.records.get(f.key).active=false;assert.equal(await a.authorizeScope(scope),false);
 await assert.rejects(a.resolveBinding(scope,'wolt'),/binding_unavailable/);
 const anon=prepared({anonymous:true});await assert.rejects(anon.service.createAuthorizedWoltStorage(scope,'sandbox'),/unauthorized/);
 await assert.rejects(f.service.createClaimedWoltStorage({},'sandbox'),/forbidden/);
 await assert.rejects(f.service.createCustomerWoltStorage({},'sandbox'),/forbidden/);
});
test('quote store preserves scoped opaque native references and create-only immutability',async()=>{
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox'),q=quote();await a.saveQuote(q);await a.saveQuote(q);
 assert.deepEqual(await a.loadQuote(scope,q.quoteRef),q);
 await assert.rejects(a.saveQuote({...q,fingerprint:'b'.repeat(64)}),/quote_conflict/);
 await assert.rejects(a.saveQuote({...q,scope:{...scope,brandId:'other'}}),/quote_unavailable/);
 await assert.rejects(a.loadQuote({...scope,locationId:'foreign'},q.quoteRef),/forbidden/);
 f.records.get(f.key).revision++;await assert.rejects(a.loadQuote(scope,q.quoteRef),/quote_unavailable/);
});
test('secret resolution revalidates native binding and rejects swapped environment/context',async()=>{
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox');
 assert.equal(await a.resolveSecret(config.secretRef,{environment:'sandbox',merchantId:'merchant'}),'sandbox_test_key_not_real_123');
 await assert.rejects(a.resolveSecret(config.secretRef,{environment:'production',merchantId:'merchant'}),/secret_unavailable/);
 const changed=prepared({secretHook:rows=>rows.get(f.key).revision++});const b=await changed.service.createAuthorizedWoltStorage(scope,'sandbox');
 await assert.rejects(b.resolveSecret(config.secretRef,{environment:'sandbox',merchantId:'merchant'}),/secret_unavailable/);
 const denied=prepared({secretError:true});const c=await denied.service.createAuthorizedWoltStorage(scope,'sandbox');
 await assert.rejects(c.resolveSecret(config.secretRef,{environment:'sandbox',merchantId:'merchant'}),e=>e.message==='secret_unavailable');
});
test('Wolt reuses SDK transport while each secret operation still reaches IAM and current binding',async()=>{
 let constructions=0,reads=0;
 const options={onSecretClient:()=>{constructions++;},secretHook:()=>{reads++;},secretError:false};
 const f=prepared(options),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox'),b=await f.service.createAuthorizedWoltStorage(scope,'sandbox');
 const context={environment:'sandbox',merchantId:'merchant'};
 await a.resolveSecret(config.secretRef,context);options.secretError=true;
 await assert.rejects(b.resolveSecret(config.secretRef,context),/secret_unavailable/);
 assert.equal(constructions,1);assert.equal(reads,2);
 options.secretError=false;f.records.get(f.key).active=false;
 await assert.rejects(a.resolveSecret(config.secretRef,context),/binding_unavailable/);assert.equal(reads,2);
});
test('transaction retry rechecks authorization and binding before quote commit',async()=>{
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox');f.records.get('platformAdminControl/access-v1').principals[0].active=false;
 await assert.rejects(a.saveQuote(quote()),/forbidden/);
 assert.equal([...f.records.keys()].some(k=>k.startsWith('deliveryPrivateWoltQuotes/')),false);
});
test('expired/future native quotes and plaintext secret bindings fail closed',async()=>{
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox'),q=quote();q.native.fetchedAt=new Date(Date.now()-301000).toISOString();await assert.rejects(a.saveQuote(q),/quote_unavailable/);
 q.native.fetchedAt=new Date(Date.now()+60000).toISOString();await assert.rejects(a.saveQuote(q),/quote_unavailable/);
 f.records.get(f.key).secretRef='plaintext-key';await assert.rejects(a.resolveBinding(scope,'wolt'),/binding_unavailable/);
});
test('private native times reject invalid calendars/offsets and preserve microseconds',()=>{
 const f=prepared(),q=quote();
 for(const invalid of ['2026-02-30T12:00:00Z','2025-02-29T12:00:00Z','2026-10-26T25:00:00Z','2026-10-26T12:00:00+14:30','2026-10-26T12:00:00+99:00','2026-10-26T12:00:00']){
 assert.equal(f.service.woltPrivateQuoteSchema.safeParse({...q,native:{...q.native,fetchedAt:invalid}}).success,false,invalid);
 }
 assert.ok(f.service.woltPrivateQuoteSchema.safeParse({...q,native:{...q.native,fetchedAt:'2026-10-26T12:00:00.123456Z'}}).success);
});


test('merchant registry rejects missing, inactive, foreign scope/environment/venue and malformed callback identity', async()=>{
 for(const patch of [null,{active:false},{environment:'production'},{merchantId:'other'},{brandId:'other'},{locationId:'other'},{venueId:'other'},{callbackId:'invalid'},{unexpected:true}]){
  const f=prepared();if(patch===null)f.records.delete(f.merchantKey);else Object.assign(f.records.get(f.merchantKey),patch);
  await assert.rejects(f.service.createAuthorizedWoltStorage(scope,'sandbox'),/binding_unavailable/);
 }
 const f=prepared(),a=await f.service.createAuthorizedWoltStorage(scope,'sandbox');
 f.records.get(f.merchantKey).locationId='another-location';
 assert.equal(await a.authorizeScope(scope),false);
 await assert.rejects(a.resolveBinding(scope,'wolt'),/binding_unavailable/);
 assert.equal(f.service.woltMerchantDocumentId('sandbox','merchant'),require('node:crypto').createHash('sha256').update(JSON.stringify(['wolt','sandbox','merchant'])).digest('hex'));
 assert.notEqual(f.service.woltMerchantDocumentId('sandbox','merchant'),f.service.woltMerchantDocumentId('production','merchant'));
});

test('second active location binding cannot reuse canonical merchant owned by first location',async()=>{
 const f=prepared(),second={brandId:scope.brandId,locationId:'location2'};
 f.records.set('locations/location2',{brandId:scope.brandId});
 f.records.get('platformAdminControl/access-v1').companies[0].locationIds.push('location2');
 f.records.set('deliveryProviderBindings/'+f.service.woltBindingDocumentId(second,'sandbox'),{...config,...second,venueId:'venue2'});
 await f.service.createAuthorizedWoltStorage(scope,'sandbox');
 await assert.rejects(f.service.createAuthorizedWoltStorage(second,'sandbox'),/binding_unavailable/);
});
