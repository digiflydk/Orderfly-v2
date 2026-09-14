import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authorize, authorizeMembershipChange, authorizeRoleChange, isSuperuser, policySchema, type Policy, PERMISSIONS } from './policy';

// Only pass identities obtained from a verified native session. Neither the
// command payload nor a user-editable profile is an authentication source.
export const identitySchema = z.discriminatedUnion('provider', [
  z.object({provider:z.literal('opsfly'),organizationId:z.string().uuid(),subject:z.string().uuid()}).strict(),
  z.object({provider:z.literal('firebase'),subject:z.string().min(1).max(128)}).strict(),
]);
export type VerifiedIdentity = z.infer<typeof identitySchema>;
export function principalKey(identity: VerifiedIdentity): string {
  const native=identitySchema.parse(identity);
  const fields=native.provider==='opsfly'?[native.provider,native.organizationId,native.subject]:[native.provider,native.subject];
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}
const key=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const authorityCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('initialize'),requestId:z.string().uuid()}).strict(),
  z.object({action:z.literal('list')}).strict(),
  z.object({action:z.literal('session')}).strict(),
  z.object({action:z.literal('nativeGrants'),product:z.enum(['opsfly','orderfly']),permission:z.string().max(160)}).strict(),
  z.object({action:z.literal('check'),companyId:key.nullable(),locationIds:z.array(key).max(500).nullable(),permission:z.string().max(160)}).strict(),
  z.object({action:z.literal('checkNative'),product:z.enum(['opsfly','orderfly']),tenantId:key,locationIds:z.array(key).max(500).nullable(),permission:z.string().max(160)}).strict(),
  z.object({action:z.literal('enroll'),identity:identitySchema,name:z.string().trim().min(1).max(160),companyId:key.nullable(),locationIds:z.array(key).max(500).nullable(),roleIds:z.array(key).max(500),revision:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid()}).strict(),
  z.object({action:z.literal('change'),kind:z.enum(['roles','memberships','principals','companies']),id:key,revision:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid(),value:z.unknown().nullable()}).strict(),
]);
export class AuthorityError extends Error {
  constructor(public code:string,public status=403){super(code);}
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject=(code:string,status=403):never=>{throw new AuthorityError(code,status);};
const requireValid=(value:unknown):Policy=>{
  const parsed=policySchema.safeParse(value);
  if(!parsed.success)return reject('invalid_policy',409);
  if(Buffer.byteLength(JSON.stringify(parsed.data),'utf8')>750000)return reject('catalog_too_large',409);
  return parsed.data;
};
function visiblePolicy(policy:Policy,actor:string) {
  if(isSuperuser(policy,actor))return policy;
  const can=(companyId:string,locationIds:string[]|null,permission:string)=>authorize(policy,{principalId:actor,companyId,locationIds,permission}).allowed;
  const memberships=policy.memberships.filter(m=>m.companyId!==null&&can(m.companyId,m.locationIds,'platform.members:view'));
  const roles=policy.roles.filter(r=>r.companyId!==null&&can(r.companyId,null,'platform.roles:view'));
  const companyIds=new Set([...memberships.map(m=>m.companyId),...roles.map(r=>r.companyId)]);
  // Principal status is global. Company administrators see only identities in
  // memberships they may inspect and cannot mutate the global identity.
  return {companies:policy.companies.filter(c=>companyIds.has(c.id)),memberships,roles,
    principals:policy.principals.filter(p=>memberships.some(m=>m.principalId===p.id))};
}
export async function executeAuthority(db:any,identity:VerifiedIdentity,input:unknown,bootstrap:VerifiedIdentity,verifyNative?:(identity:VerifiedIdentity)=>Promise<boolean>) {
  const actor=principalKey(identity),bootstrapActor=principalKey(bootstrap);
  const command=authorityCommandSchema.parse(input);
  const policyRef=db.collection('platformAdminControl').doc('access-v1');
  return db.runTransaction(async(tx:any)=>{
    const saved=await tx.get(policyRef);
    if(command.action==='initialize') {
      if(actor!==bootstrapActor)return reject('forbidden');
      if(saved.exists)return reject('already_initialized',409);
      const initial:Policy={principals:[{id:actor,active:true,name:'Platformadministrator'}],companies:[],
        roles:[{id:'platform-owner',name:'Platform superuser',companyId:null,kind:'superuser',permissions:[],active:true}],
        memberships:[{id:'platform-owner',principalId:actor,companyId:null,locationIds:null,roleIds:['platform-owner'],active:true}]};
      const auditRef=db.collection('platformAdminAudit').doc(command.requestId);
      if((await tx.get(auditRef)).exists)return reject('request_conflict',409);
      tx.set(policyRef,initial);
      tx.set(auditRef,{actorId:actor,action:'access.initialize',createdAt:new Date().toISOString(),revision:digest(initial)});
      return {ok:true,revision:digest(initial)};
    }
    if(!saved.exists)return reject('not_initialized',503);
    const policy=requireValid(saved.data());
    if(!policy.principals.some(p=>p.id===actor&&p.active))return reject('principal_inactive');
    if(command.action==='session') {
      const superuser=isSuperuser(policy,actor);
      const memberships=policy.memberships.filter(m=>m.principalId===actor&&m.active&&(m.companyId===null||policy.companies.some(c=>c.id===m.companyId&&c.active)));
      const roles=policy.roles.filter(r=>r.active&&memberships.some(m=>m.roleIds.includes(r.id)));
      return {actorId:actor,superuser,name:policy.principals.find(p=>p.id===actor)?.name||'Bruger',permissions:superuser?PERMISSIONS:[...new Set(roles.flatMap(r=>r.permissions))]};
    }
    if(command.action==='nativeGrants') {
      if(!command.permission.startsWith(command.product+'.')||!PERMISSIONS.includes(command.permission))return reject('permission_missing');
      const grants:Array<{tenantId:string;locationIds:string[]|null}>=[];
      for(const company of policy.companies.filter(c=>c.active)) {
        const tenants=command.product==='orderfly'?company.orderflyBrandIds:company.opsflyOrganizationId?[company.opsflyOrganizationId]:[];
        const can=(locationIds:string[]|null)=>authorize(policy,{principalId:actor,companyId:company.id,locationIds,permission:command.permission}).allowed;
        const locationIds=can(null)?null:company.locationIds.filter(id=>can([id]));
        if(locationIds!==null&&!locationIds.length)continue;
        for(const tenantId of tenants)grants.push({tenantId,locationIds});
      }
      return {grants};
    }
    if(command.action==='check')return authorize(policy,{principalId:actor,companyId:command.companyId,locationIds:command.locationIds,permission:command.permission});
    if(command.action==='checkNative') {
      const company=policy.companies.find(c=>command.product==='opsfly'?c.opsflyOrganizationId===command.tenantId:c.orderflyBrandIds.includes(command.tenantId));
      if(!company||!command.permission.startsWith(command.product+'.'))return {allowed:false,reason:'native_tenant_unlinked'};
      return authorize(policy,{principalId:actor,companyId:company.id,locationIds:command.locationIds,permission:command.permission});
    }
    if(command.action==='list') {
      const superuser=isSuperuser(policy,actor);
      const directoryOrganizationIds=policy.companies.filter(c=>c.opsflyOrganizationId&&authorize(policy,{principalId:actor,companyId:c.id,locationIds:null,permission:'platform.members:view'}).allowed).map(c=>c.opsflyOrganizationId);
      return {mode:'freemium',actorId:actor,superuser,permissions:PERMISSIONS,revision:digest(policy),directoryOrganizationIds,...visiblePolicy(policy,actor)};
    }
    if(command.action==='enroll') {
      const target=principalKey(command.identity);
      const existing=policy.principals.find(p=>p.id===target);
      if(existing&&!existing.active)return reject('principal_inactive');
      if(command.identity.provider==='opsfly'&&command.companyId!==null&&
        policy.companies.find(c=>c.id===command.companyId)?.opsflyOrganizationId!==command.identity.organizationId)return reject('organization_mismatch');
      const id=digest({principalId:target,companyId:command.companyId});
      const previous=policy.memberships.find(m=>m.principalId===target&&m.companyId===command.companyId)||null;
      const membership={id:previous?.id||id,principalId:target,companyId:command.companyId,locationIds:command.locationIds,roleIds:command.roleIds,active:true};
      const withPrincipal=requireValid({...policy,principals:existing?policy.principals:[...policy.principals,{id:target,active:true,name:command.name}]});
      // Enrollment always requires create authority, including an idempotent
      // retry. Do not accidentally change that requirement to edit after the
      // first request has committed. All other current grants remain in force.
      const enrollmentPolicy=previous?{...withPrincipal,memberships:withPrincipal.memberships.filter(m=>m.id!==previous.id)}:withPrincipal;
      const decision=authorizeMembershipChange(enrollmentPolicy,actor,null,membership);
      if(!decision.allowed)return reject(decision.reason);
      const eventRef=db.collection('platformAdminAudit').doc(command.requestId),event=await tx.get(eventRef),fingerprint=digest({actor,command});
      if(event.exists){if(event.data().fingerprint!==fingerprint)return reject('request_conflict',409);return {ok:true,revision:digest(policy)};}
      if(command.revision!==digest(policy))return reject('record_changed',409);
      if(previous)return reject('membership_exists',409);
      if(!verifyNative||!await verifyNative(command.identity))return reject('native_identity_unavailable',409);
      const next=requireValid({...withPrincipal,memberships:[...withPrincipal.memberships,membership]});
      tx.set(policyRef,next);
      tx.set(eventRef,{actorId:actor,action:'access.enroll',recordId:membership.id,fingerprint,revision:digest(next),createdAt:new Date().toISOString()});
      return {ok:true,revision:digest(next)};
    }
    const previous=policy[command.kind].find(row=>row.id===command.id)||null;
    const candidate=command.value;
    if(candidate!==null&&(typeof candidate!=='object'||Array.isArray(candidate)||(candidate as any).id!==command.id))return reject('immutable_identity',400);
    // Authorize against current policy even on retries. Revocation must not be
    // bypassed by replaying a formerly successful request identifier.
    const decision=command.kind==='roles'?authorizeRoleChange(policy,actor,previous,candidate):
      command.kind==='memberships'?authorizeMembershipChange(policy,actor,previous,candidate):
      {allowed:isSuperuser(policy,actor),reason:'platform_access_required'};
    if(!decision.allowed)return reject(decision.reason);
    const eventRef=db.collection('platformAdminAudit').doc(command.requestId);
    const event=await tx.get(eventRef),fingerprint=digest({actor,command});
    if(event.exists){if(event.data().fingerprint!==fingerprint)return reject('request_conflict',409);return {ok:true,revision:digest(policy)};}
    if(command.revision!==digest(policy))return reject('record_changed',409);
    if(!previous&&candidate===null)return reject('record_missing',409);
    const next=requireValid({...policy,[command.kind]:policy[command.kind].filter(row=>row.id!==command.id).concat(candidate===null?[]:[candidate as any])});
    if(!next.principals.some(p=>isSuperuser(next,p.id)))return reject('last_superuser',409);
    tx.set(policyRef,next);
    tx.set(eventRef,{actorId:actor,action:'access.change',kind:command.kind,recordId:command.id,fingerprint,revision:digest(next),createdAt:new Date().toISOString()});
    return {ok:true,revision:digest(next)};
  });
}
