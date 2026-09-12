import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { accessSchemas, accessCollections, ACCESS_MODULES, ACCESS_PERMISSIONS, previewSchema, evaluateAccess } from './platform-access';
import { ALL_PERMISSIONS } from '@/lib/permissions';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const clean = z.string().trim().min(2).max(160);
const unique = (values: string[]) => new Set(values).size === values.length;
export const commandSchema = z.discriminatedUnion('action', [
  z.object({action:z.literal('list')}).strict(),
  previewSchema,
  z.object({action:z.literal('save'),kind:z.enum(['users','roles','plans','companies','accessPlans','accessRoles','memberships']),id:id.optional(),revision:z.string().max(100).optional(),requestId:z.string().uuid(),data:z.unknown()}).strict(),
  z.object({action:z.literal('delete'),kind:z.enum(['users','roles','plans','companies','accessPlans','accessRoles','memberships']),id,revision:z.string().min(1).max(100),requestId:z.string().uuid()}).strict(),
]);
export const envelopeSchema = z.object({actorId:z.string().uuid(),organizationId:z.string().uuid(),command:commandSchema}).strict();
const schemas = {
  ...accessSchemas,
  users:z.object({name:clean,email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),roleIds:z.array(id).max(50).refine(unique)}).strict(),
  roles:z.object({name:clean,description:z.string().trim().max(1000),permissions:z.array(z.string()).max(150).refine(unique).refine(v=>v.every(p=>ALL_PERMISSIONS.some(d=>d.id===p)))}).strict(),
  plans:z.object({name:clean,priceMonthly:z.number().finite().min(0).max(1000000),priceYearly:z.number().finite().min(0).max(10000000),serviceFee:z.number().finite().min(0).max(100),isActive:z.boolean(),isMostPopular:z.boolean()}).strict(),
};
const collections = {users:'users',roles:'roles',plans:'subscription_plans',...accessCollections} as const;
export class PlatformAdminError extends Error {
  constructor(public code:string,public status=400) { super(code); }
}
function revision(snap:any) {
  return createHash('sha256').update(JSON.stringify(snap.data())).digest('hex');
}
function record(kind:keyof typeof collections,snap:any) {
  const d=snap.data();
  if(kind in accessSchemas) {
    const schema=accessSchemas[kind as keyof typeof accessSchemas];
    const parsed=schema.parse(Object.fromEntries(Object.entries(d).filter(([key])=>key!=='id')));
    return {...parsed,id:snap.id,revision:revision(snap)};
  }
  const base={id:snap.id,revision:revision(snap),name:typeof d.name==='string'?d.name:''};
  if(kind==='users') return {...base,email:typeof d.email==='string'?d.email:'',roleIds:Array.isArray(d.roleIds)?d.roleIds.filter((v:unknown)=>typeof v==='string'):[]};
  if(kind==='roles') return {...base,description:typeof d.description==='string'?d.description:'',permissions:Array.isArray(d.permissions)?d.permissions.filter((v:unknown)=>typeof v==='string'):[]};
  return {...base,priceMonthly:Number(d.priceMonthly)||0,priceYearly:Number(d.priceYearly)||0,serviceFee:Number(d.serviceFee)||0,isActive:d.isActive===true,isMostPopular:d.isMostPopular===true};
}
export async function executePlatformAdmin(input:z.infer<typeof envelopeSchema>, db:any=getAdminDb()) {
  const {command,actorId,organizationId}=envelopeSchema.parse(input);
  if(command.action==='preview') {
    return db.runTransaction(async(tx:any)=>{
      const catalog:any={};
      for(const [kind,collection] of Object.entries(accessCollections)) {
        const snap=await tx.get(db.collection(collection).limit(501));
        if(snap.docs.length>500)throw new PlatformAdminError('catalog_too_large',409);
        catalog[kind]=snap.docs.map((d:any)=>record(kind as keyof typeof collections,d));
      }
      const result=evaluateAccess(catalog,command);
      if(!result.allowed||command.product!=='orderfly')return result;
      // Legacy brand deletion is outside this catalogue. Check native references in
      // the same read transaction so stale saved links never produce an allow result.
      const company=catalog.companies.find((c:any)=>c.id===command.companyId);
      for(const brandId of company.orderflyBrandIds) {
        if(!(await tx.get(db.collection('brands').doc(brandId))).exists)return {...result,allowed:false,reason:'product_unlinked'};
      }
      if(!(await tx.get(db.collection('users').doc(command.principalId))).exists)return {...result,allowed:false,reason:'membership_inactive'};
      return result;
    });
  }
  if(command.action==='list') {
    const result:any={permissions:ALL_PERMISSIONS,accessModules:ACCESS_MODULES,accessPermissions:ACCESS_PERMISSIONS,accessMode:"preview"};
    for(const kind of ['users','roles','plans','companies','accessPlans','accessRoles','memberships'] as const) {
      const snap=await db.collection(collections[kind]).limit(501).get();
      if(snap.docs.length>500) throw new PlatformAdminError('catalog_too_large',409);
      result[kind]=snap.docs.map((d:any)=>record(kind,d)).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    }
    const brands=await db.collection('brands').limit(501).get();
    if(brands.docs.length>500)throw new PlatformAdminError('catalog_too_large',409);
    result.orderflyBrands=brands.docs.map((d:any)=>({id:d.id,name:typeof d.data().name==='string'?d.data().name:d.id}));
    return result;
  }
  const data=command.action==='save'?schemas[command.kind].parse(command.data):null;
  if(command.action==='save' && Boolean(command.id)!==Boolean(command.revision)) throw new PlatformAdminError('revision_required');
  const fingerprint=createHash('sha256').update(JSON.stringify({command,actorId,organizationId})).digest('hex');
  const eventRef=db.collection('platformAdminAudit').doc(command.requestId);
  const lockRef=db.collection('platformAdminControl').doc('catalog');
  const ref=command.action==='save'&&!command.id?db.collection(collections[command.kind]).doc():db.collection(collections[command.kind]).doc(command.id);
  return db.runTransaction(async(tx:any)=>{
    const prior=await tx.get(eventRef);
    if(prior.exists) {
      if(prior.data().fingerprint!==fingerprint) throw new PlatformAdminError('request_conflict',409);
      return {ok:true,id:prior.data().recordId};
    }
    await tx.get(lockRef);
    const current=await tx.get(ref);
    if(command.id && (!current.exists||revision(current)!==command.revision)) throw new PlatformAdminError('record_changed',409);
    if(!command.id&&current.exists) throw new PlatformAdminError('record_changed',409);
    if(command.action==='save'&&!command.id) {
      const capacity=await tx.get(db.collection(collections[command.kind]).limit(500));
      if(capacity.docs.length>=500)throw new PlatformAdminError('catalog_too_large',409);
    }
    if(command.action==='save'&&command.kind==='users') {
      for(const roleId of (data as z.infer<typeof schemas.users>).roleIds) {
        if(!(await tx.get(db.collection('roles').doc(roleId))).exists) throw new PlatformAdminError('role_missing',409);
      }
    }
    if(command.action==='save' && command.kind in accessSchemas) {
      const value=data as any;
      const exists=async(collection:string,key:string)=> (await tx.get(db.collection(collection).doc(key))).exists;
      const occupied=async(query:any)=> (await tx.get(query)).docs.some((d:any)=>d.id!==ref.id);
      if(command.kind==='companies') {
        if(value.planId&&!await exists(accessCollections.accessPlans,value.planId))throw new PlatformAdminError('reference_missing',409);
        for(const brand of value.orderflyBrandIds) {
          if(!await exists('brands',brand))throw new PlatformAdminError('reference_missing',409);
          if(await occupied(db.collection(accessCollections.companies).where('orderflyBrandIds','array-contains',brand)))throw new PlatformAdminError('reference_in_use',409);
        }
        if(value.opsflyOrganizationId&&await occupied(db.collection(accessCollections.companies).where('opsflyOrganizationId','==',value.opsflyOrganizationId)))throw new PlatformAdminError('reference_in_use',409);
        if(current.exists&&current.data().opsflyOrganizationId!==value.opsflyOrganizationId) {
          const members=await tx.get(db.collection(accessCollections.memberships).where('companyId','==',ref.id));
          if(members.docs.some((d:any)=>d.data().product==='opsfly'))throw new PlatformAdminError('record_in_use',409);
        }
      }
      if(command.kind==='memberships') {
        const company=await tx.get(db.collection(accessCollections.companies).doc(value.companyId));
        if(!company.exists)throw new PlatformAdminError('reference_missing',409);
        if(value.product==='opsfly'&&value.principalOrganizationId!==company.data().opsflyOrganizationId)throw new PlatformAdminError('organization_mismatch',409);
        if(value.product==='orderfly'&&(!company.data().orderflyBrandIds.length||!await exists('users',value.principalId)))throw new PlatformAdminError('reference_missing',409);
        for(const role of value.roleIds)if(!await exists(accessCollections.accessRoles,role))throw new PlatformAdminError('role_missing',409);
        const members=await tx.get(db.collection(accessCollections.memberships).where('companyId','==',value.companyId));
        if(members.docs.some((d:any)=>d.id!==ref.id&&d.data().product===value.product&&d.data().principalId===value.principalId))throw new PlatformAdminError('reference_in_use',409);
      }
    }
    if(command.action==='delete') {
      const checks=command.kind==='companies'?[db.collection(accessCollections.memberships).where('companyId','==',command.id)]:
        command.kind==='accessPlans'?[db.collection(accessCollections.companies).where('planId','==',command.id)]:
        command.kind==='accessRoles'?[db.collection(accessCollections.memberships).where('roleIds','array-contains',command.id)]:
        command.kind==='memberships'?[]:command.kind==='roles'?[db.collection('users').where('roleIds','array-contains',command.id)]:
        command.kind==='plans'?[db.collection('brands').where('subscriptionPlanId','==',command.id),db.collection('subscriptions').where('planId','==',command.id)]:
        [db.collection('brands').where('ownerId','==',command.id)];
      for(const query of checks) if(!(await tx.get(query.limit(1))).empty) throw new PlatformAdminError('record_in_use',409);
      if(command.kind==='users') {
        const members=await tx.get(db.collection(accessCollections.memberships).where('principalId','==',command.id).limit(501));
        if(members.docs.length>500)throw new PlatformAdminError('catalog_too_large',409);
        if(members.docs.some((m:any)=>m.data().product==='orderfly'))throw new PlatformAdminError('record_in_use',409);
      }
    }
    if(command.action==='delete') tx.delete(ref);
    else tx.set(ref,{...data,id:ref.id},{merge:true});
    tx.set(lockRef,{lastRequestId:command.requestId});
    tx.set(eventRef,{actorId,organizationId,action:command.action,kind:command.kind,recordId:ref.id,fingerprint,createdAt:new Date().toISOString()});
    return {ok:true,id:ref.id};
  });
}
