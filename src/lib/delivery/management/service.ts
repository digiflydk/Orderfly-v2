import 'server-only';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {requirePlatformSuperuser} from '@/lib/access/orderfly-session';
import {AuthorityError,principalKey,type VerifiedIdentity} from '@/lib/access/authority';
import {policySchema,isSuperuser} from '@/lib/access/policy';
import {loadDeliverySettingsInTransaction} from '../settings/server';
import {loadGeoapifyPlatformInTransaction} from './platform';
import {provisionDeliveryMerchantSecrets} from './secrets';
import {verifyWoltMerchantConnection,ensureWoltMerchantCallback} from './wolt';
import {deliveryMerchantCreateSchema,deliveryMerchantUpdateSchema,deliveryMerchantActionSchema,deliveryMerchantRecordSchema,deliveryMerchantIdSchema,deliveryMerchantListSchema,deliveryMerchantId,deliveryMerchantDto,type DeliveryMerchantRecord} from './schema';

export class DeliveryManagementError extends Error {constructor(readonly code:string,readonly status=409){super(code);}}
const fail=(code:string,status=409):never=>{throw new DeliveryManagementError(code,status);};
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const merchantRef=(id:string)=>getAdminDb().collection('deliveryMerchantEnrollments').doc(id);
export async function authorizeMerchantManagement(tx:FirebaseFirestore.Transaction,identity:VerifiedIdentity,scope?:{brandId:string;locationId:string}){
 const db=getAdminDb(),policy=policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
 if(!policy.success||!isSuperuser(policy.data,principalKey(identity)))throw new AuthorityError('forbidden');
 if(scope){const [brand,location]=await Promise.all([tx.get(db.collection('brands').doc(scope.brandId)),tx.get(db.collection('locations').doc(scope.locationId))]);
  if(!brand.exists||!location.exists||location.data()?.brandId!==scope.brandId)throw new AuthorityError('forbidden');}
}
function parseRow(data:unknown,id:string){const row=deliveryMerchantRecordSchema.parse(data);if(row.id!==id||deliveryMerchantId(row,row.environment)!==id)fail('configuration_unavailable',503);return row;}
async function load(tx:FirebaseFirestore.Transaction,id:string){const snap=await tx.get(merchantRef(id));if(!snap.exists)fail('not_found',404);return parseRow(snap.data(),id);}
function matchRevision(row:DeliveryMerchantRecord,revision:number){if(row.revision!==revision)fail('record_conflict');}
function audit(tx:FirebaseFirestore.Transaction,row:DeliveryMerchantRecord,identity:VerifiedIdentity,action:string,attestation?:{pickupVenueConfirmed:true}){
 // Audit contains state and actor only, never credentials, secret references or callback keys.
 tx.create(merchantRef(row.id).collection('audit').doc(String(row.revision)),{version:1,merchantEnrollmentId:row.id,brandId:row.brandId,locationId:row.locationId,environment:row.environment,revision:row.revision,action,actorId:principalKey(identity),status:row.status,atMs:row.updatedAtMs,...attestation});
 tx.set(merchantRef(row.id),row);
}
export async function listDeliveryMerchants(input:unknown){
 const query=deliveryMerchantListSchema.parse(input),session=await requirePlatformSuperuser(),db=getAdminDb();
 return db.runTransaction(async tx=>{
  await authorizeMerchantManagement(tx,session.identity,query.brandId&&query.locationId?{brandId:query.brandId,locationId:query.locationId}:undefined);
  let q:FirebaseFirestore.Query=db.collection('deliveryMerchantEnrollments').orderBy('__name__');
  if(query.brandId)q=q.where('brandId','==',query.brandId);if(query.locationId)q=q.where('locationId','==',query.locationId);if(query.cursor)q=q.startAfter(query.cursor);
  const rows=await tx.get(q.limit(51)),page=rows.docs.slice(0,50),merchants=page.map(doc=>parseRow(doc.data(),doc.id)).filter(row=>query.includeArchived==='true'||row.status!=='archived').map(deliveryMerchantDto);
  return {merchants,nextCursor:rows.docs.length>50?page[page.length-1].id:null};
 });
}
export async function getDeliveryMerchant(input:string){
 const id=deliveryMerchantIdSchema.parse(input),session=await requirePlatformSuperuser();
 return getAdminDb().runTransaction(async tx=>{const row=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,row);return {merchant:deliveryMerchantDto(row)};});
}
export async function createDeliveryMerchant(input:unknown){
 const command=deliveryMerchantCreateSchema.parse(input),session=await requirePlatformSuperuser(),db=getAdminDb(),id=deliveryMerchantId(command,command.environment),ref=merchantRef(id);
 await db.runTransaction(async tx=>{await authorizeMerchantManagement(tx,session.identity,command);if((await tx.get(ref)).exists)fail('record_conflict');});
 const secretRefs=command.credentials?.apiKey||command.credentials?.webhookSigningSecret
  ?await provisionDeliveryMerchantSecrets({environment:command.environment,merchantId:command.merchantId,...command.credentials,existing:{api:null,webhook:null}}):{api:null,webhook:null};
 return db.runTransaction(async tx=>{
  await authorizeMerchantManagement(tx,session.identity,command);if((await tx.get(ref)).exists)fail('record_conflict');
  const {credentials,...metadata}=command,now=Date.now();
  const row=deliveryMerchantRecordSchema.parse({...metadata,version:1,id,status:'draft',revision:1,secretRefs,callbackKey:randomBytes(32).toString('hex'),callbackStatus:'unregistered',providerWebhookId:null,connectionStatus:'untested',connectionCheckedAtMs:null,productionApproved:false,operation:null,provisioned:false,createdAtMs:now,updatedAtMs:now});
  audit(tx,row,session.identity,'merchant.create');return {merchant:deliveryMerchantDto(row)};
 });
}
export async function updateDeliveryMerchant(rawId:string,input:unknown){
 const id=deliveryMerchantIdSchema.parse(rawId),command=deliveryMerchantUpdateSchema.parse(input),session=await requirePlatformSuperuser(),db=getAdminDb();
 const before=await db.runTransaction(async tx=>{const row=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,row);matchRevision(row,command.expectedRevision);
  if(row.status==='archived'||row.status==='active'||row.operation)fail('merchant_not_editable');
  if((row.provisioned||row.callbackStatus!=='unregistered')&&(row.merchantId!==command.merchantId||row.venueId!==command.venueId||command.credentials?.apiKey||command.credentials?.webhookSigningSecret))fail('merchant_binding_locked');return row;});
 const existing=before.merchantId===command.merchantId?before.secretRefs:{api:null,webhook:null};
 const secretRefs=command.credentials?.apiKey||command.credentials?.webhookSigningSecret
  ?await provisionDeliveryMerchantSecrets({environment:before.environment,merchantId:command.merchantId,...command.credentials,existing}):existing;
 return db.runTransaction(async tx=>{const current=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,current);matchRevision(current,command.expectedRevision);
  const {expectedRevision,credentials,...metadata}=command;
  const credentialsChanged=secretRefs.api!==current.secretRefs.api||secretRefs.webhook!==current.secretRefs.webhook||metadata.merchantId!==current.merchantId||metadata.venueId!==current.venueId;
  const row=deliveryMerchantRecordSchema.parse({...current,...metadata,secretRefs,connectionStatus:credentialsChanged?'untested':current.connectionStatus,connectionCheckedAtMs:credentialsChanged?null:current.connectionCheckedAtMs,revision:current.revision+1,updatedAtMs:Date.now()});
  audit(tx,row,session.identity,'merchant.update');return {merchant:deliveryMerchantDto(row)};
 });
}
function nativeRefs(row:DeliveryMerchantRecord){
 const db=getAdminDb(),scopeHash=hash([row.brandId,row.locationId]),callbackId=createHash('sha256').update(row.callbackKey).digest('hex');
 return {scopeHash,callbackId,binding:db.collection('deliveryProviderBindings').doc(hash([row.brandId,row.locationId,'wolt',row.environment])),merchant:db.collection('deliveryWoltMerchants').doc(hash(['wolt',row.environment,row.merchantId])),callback:db.collection('deliveryProviderCallbacks').doc(callbackId),runtime:db.collection('deliveryRuntimeConfigs').doc(scopeHash),adoption:db.collection('deliveryAdoptions').doc(scopeHash)};
}
async function prepareNative(tx:FirebaseFirestore.Transaction,row:DeliveryMerchantRecord){
 if(!row.secretRefs.api||!row.secretRefs.webhook)fail('credentials_required');
 const refs=nativeRefs(row),[binding,merchant,callback]=await Promise.all([tx.get(refs.binding),tx.get(refs.merchant),tx.get(refs.callback)]);
 const bindingValue={schemaVersion:1,brandId:row.brandId,locationId:row.locationId,provider:'wolt',environment:row.environment,active:true,revision:1,merchantId:row.merchantId,venueId:row.venueId,secretRef:row.secretRefs.api};
 const merchantValue={version:1,environment:row.environment,merchantId:row.merchantId,brandId:row.brandId,locationId:row.locationId,venueId:row.venueId,callbackId:refs.callbackId,active:true};
 const callbackValue={version:1,active:true,brandId:row.brandId,locationId:row.locationId,environment:row.environment,merchantId:row.merchantId,venueId:row.venueId,bindingRevision:1,revision:1,signingSecretRef:row.secretRefs.webhook};
 const same=(a:Record<string,unknown>|undefined,b:Record<string,unknown>)=>!!a&&Object.keys(a).length===Object.keys(b).length&&Object.entries(b).every(([k,v])=>a[k]===v);
 if(binding.exists&&!same(binding.data(),bindingValue)||merchant.exists&&!same(merchant.data(),merchantValue)||callback.exists&&!same(callback.data(),callbackValue))fail('merchant_scope_conflict');
 return ()=>{if(!binding.exists)tx.create(refs.binding,bindingValue);if(!merchant.exists)tx.create(refs.merchant,merchantValue);if(!callback.exists)tx.create(refs.callback,callbackValue);};
}
function callbackUrl(row:DeliveryMerchantRecord){
 // Never turn a caller-controlled Host/X-Forwarded-Host into an external callback target.
 const origin=new URL(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://orderfly.dk');
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')fail('callback_origin_unavailable',503);
 return `${origin.origin}/api/delivery/webhooks/wolt/${row.callbackKey}`;
}
export async function actOnDeliveryMerchant(rawId:string,input:unknown){
 const id=deliveryMerchantIdSchema.parse(rawId),command=deliveryMerchantActionSchema.parse(input),session=await requirePlatformSuperuser(),db=getAdminDb();
 if(['activate','deactivate','delete','restore'].includes(command.action))return db.runTransaction(async tx=>{
  const current=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,current);matchRevision(current,command.expectedRevision);
  if(command.action==='restore'){
   if(current.status!=='archived')fail('merchant_not_archived');
   const row={...current,status:'inactive' as const,revision:current.revision+1,updatedAtMs:Date.now()};audit(tx,row,session.identity,'merchant.restore');return {merchant:deliveryMerchantDto(row)};
  }
  if(current.status==='archived')fail('merchant_not_editable');
  if(command.action==='activate'){
   if(command.pickupVenueConfirmed!==true)fail('pickup_venue_confirmation_required');
   if(current.operation)fail('operation_in_progress');
   if(current.connectionStatus!=='verified'||current.callbackStatus!=='registered'||!current.provisioned)fail('merchant_not_ready');
   if(current.environment==='production'&&command.productionApproved!==true)fail('production_approval_required');
   const otherId=deliveryMerchantId(current,current.environment==='sandbox'?'production':'sandbox'),other=await tx.get(merchantRef(otherId));
   if(other.exists&&parseRow(other.data(),otherId).status==='active')fail('environment_conflict');
   const platform=await loadGeoapifyPlatformInTransaction(tx);
   if(!platform?.enabled||!platform.retentionApproved||!platform.secretRef)fail('routing_not_ready');
   const {result}=await loadDeliverySettingsInTransaction(tx,current.brandId,current.locationId);
   if(!result.settings.enabled||result.settings.paused||result.settings.providerId!=='wolt'||!result.settings.pricingRules)fail('delivery_settings_not_ready');
   const writeNative=await prepareNative(tx,current),refs=nativeRefs(current);
   const existingRuntime=await tx.get(refs.runtime),existingAdoption=await tx.get(refs.adoption);
   if(existingRuntime.exists&&(existingRuntime.data()?.scope?.brandId!==current.brandId||existingRuntime.data()?.scope?.locationId!==current.locationId))fail('merchant_scope_conflict');
   if(existingAdoption.exists&&(existingAdoption.data()?.version!==1||existingAdoption.data()?.brandId!==current.brandId||existingAdoption.data()?.locationId!==current.locationId||existingAdoption.data()?.mode!=='managed'))fail('merchant_scope_conflict');
   const row={...current,status:'active' as const,productionApproved:current.productionApproved||command.productionApproved===true,revision:current.revision+1,updatedAtMs:Date.now()};
   writeNative();tx.set(refs.runtime,{scope:{brandId:row.brandId,locationId:row.locationId},environment:row.environment,routingSource:'geoapify',routingApprovalRef:platform!.routingApprovalRef,retentionApprovalRef:platform!.retentionApprovalRef,pickupContact:row.pickupContact});
   tx.set(refs.adoption,{version:1,brandId:row.brandId,locationId:row.locationId,mode:'managed'});audit(tx,row,session.identity,'merchant.activate',{pickupVenueConfirmed:true});return {merchant:deliveryMerchantDto(row)};
  }
  // Keep native canonical bindings, callback intake and adoption: existing orders must recover.
  const row={...current,status:command.action==='delete'?'archived' as const:'inactive' as const,revision:current.revision+1,updatedAtMs:Date.now()};
  audit(tx,row,session.identity,`merchant.${command.action}`);return {merchant:deliveryMerchantDto(row)};
 });
 const operationId=randomUUID();
 const claimed=await db.runTransaction(async tx=>{
  const current=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,current);matchRevision(current,command.expectedRevision);
  if(current.status==='archived')fail('merchant_not_editable');
  if(current.operation?.state==='running'&&Date.now()-current.operation.startedAtMs<60000)fail('operation_in_progress');
  if(current.operation&&current.operation.kind!==command.action)fail('operation_in_progress');
  if(!current.secretRefs.api)fail('credentials_required');
  let writeNative:(()=>void)|null=null;
  if(command.action==='register_callback'){
   if(current.connectionStatus!=='verified')fail('connection_not_verified');
   callbackUrl(current);writeNative=await prepareNative(tx,current);
  }
  const row:DeliveryMerchantRecord={...current,revision:current.revision+1,updatedAtMs:Date.now(),operation:{id:operationId,kind:command.action as 'test'|'register_callback',state:'running',startedAtMs:Date.now()},
   ...(command.action==='register_callback'?{callbackStatus:'unknown',provisioned:true}:{})};
  writeNative?.();audit(tx,row,session.identity,`merchant.${command.action}.started`);
  return {row,allowCreate:current.callbackStatus==='unregistered'&&!current.operation};
 });
 let connectionVerified=false,registration:{status:'registered'|'unknown';webhookId?:string}|null=null;
 try{
  const base={environment:claimed.row.environment,merchantId:claimed.row.merchantId,venueId:claimed.row.venueId,apiSecretRef:claimed.row.secretRefs.api!};
  if(command.action==='test')connectionVerified=await verifyWoltMerchantConnection(base);
  else registration=await ensureWoltMerchantCallback({...base,signingSecretRef:claimed.row.secretRefs.webhook!,callbackUrl:callbackUrl(claimed.row),allowCreate:claimed.allowCreate,...(claimed.row.providerWebhookId?{ownedWebhookId:claimed.row.providerWebhookId}:{}),beforeCreate:async()=>{
   await db.runTransaction(async tx=>{const current=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,current);if(current.operation?.id!==operationId||current.operation.state!=='running')fail('record_conflict');});
  }});
 }catch{/* Persist a sanitized uncertain result; never expose provider or credential errors. */}
 return db.runTransaction(async tx=>{
  const current=await load(tx,id);await authorizeMerchantManagement(tx,session.identity,current);
  if(current.operation?.id!==operationId||current.operation.state!=='running')fail('record_conflict');
  const row:DeliveryMerchantRecord={...current,revision:current.revision+1,updatedAtMs:Date.now(),operation:null};
  if(command.action==='test'){row.connectionStatus=connectionVerified?'verified':'failed';row.connectionCheckedAtMs=Date.now();}
  else {row.callbackStatus=registration?.status==='registered'?'registered':'unknown';if(registration?.webhookId)row.providerWebhookId=registration.webhookId;
   if(row.callbackStatus==='unknown')row.operation={...current.operation!,state:'unknown'};}
  audit(tx,row,session.identity,`merchant.${command.action}.finished`);return {merchant:deliveryMerchantDto(row)};
 });
}
