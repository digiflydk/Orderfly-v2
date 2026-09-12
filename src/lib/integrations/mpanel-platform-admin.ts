import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { ALL_PERMISSIONS } from '@/lib/permissions';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const clean = z.string().trim().min(2).max(160);
const unique = (values: string[]) => new Set(values).size === values.length;
export const commandSchema = z.discriminatedUnion('action', [
  z.object({action:z.literal('list')}).strict(),
  z.object({action:z.literal('save'),kind:z.enum(['users','roles','plans']),id:id.optional(),revision:z.string().max(100).optional(),requestId:z.string().uuid(),data:z.unknown()}).strict(),
  z.object({action:z.literal('delete'),kind:z.enum(['users','roles','plans']),id,revision:z.string().min(1).max(100),requestId:z.string().uuid()}).strict(),
]);
export const envelopeSchema = z.object({actorId:z.string().uuid(),organizationId:z.string().uuid(),command:commandSchema}).strict();
const schemas = {
  users:z.object({name:clean,email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),roleIds:z.array(id).max(50).refine(unique)}).strict(),
  roles:z.object({name:clean,description:z.string().trim().max(1000),permissions:z.array(z.string()).max(150).refine(unique).refine(v=>v.every(p=>ALL_PERMISSIONS.some(d=>d.id===p)))}).strict(),
  plans:z.object({name:clean,priceMonthly:z.number().finite().min(0).max(1000000),priceYearly:z.number().finite().min(0).max(10000000),serviceFee:z.number().finite().min(0).max(100),isActive:z.boolean(),isMostPopular:z.boolean()}).strict(),
};
const collections = {users:'users',roles:'roles',plans:'subscription_plans'} as const;
export class PlatformAdminError extends Error {
  constructor(public code:string,public status=400) { super(code); }
}
function revision(snap:any) {
  return createHash('sha256').update(JSON.stringify(snap.data())).digest('hex');
}
function record(kind:keyof typeof collections,snap:any) {
  const d=snap.data();
  const base={id:snap.id,revision:revision(snap),name:typeof d.name==='string'?d.name:''};
  if(kind==='users') return {...base,email:typeof d.email==='string'?d.email:'',roleIds:Array.isArray(d.roleIds)?d.roleIds.filter((v:unknown)=>typeof v==='string'):[]};
  if(kind==='roles') return {...base,description:typeof d.description==='string'?d.description:'',permissions:Array.isArray(d.permissions)?d.permissions.filter((v:unknown)=>typeof v==='string'):[]};
  return {...base,priceMonthly:Number(d.priceMonthly)||0,priceYearly:Number(d.priceYearly)||0,serviceFee:Number(d.serviceFee)||0,isActive:d.isActive===true,isMostPopular:d.isMostPopular===true};
}
export async function executePlatformAdmin(input:z.infer<typeof envelopeSchema>, db:any=getAdminDb()) {
  const {command,actorId,organizationId}=envelopeSchema.parse(input);
  if(command.action==='list') {
    const result:any={permissions:ALL_PERMISSIONS};
    for(const kind of ['users','roles','plans'] as const) {
      const snap=await db.collection(collections[kind]).limit(501).get();
      if(snap.docs.length>500) throw new PlatformAdminError('catalog_too_large',409);
      result[kind]=snap.docs.map((d:any)=>record(kind,d)).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    }
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
    if(command.action==='save'&&command.kind==='users') {
      for(const roleId of (data as z.infer<typeof schemas.users>).roleIds) {
        if(!(await tx.get(db.collection('roles').doc(roleId))).exists) throw new PlatformAdminError('role_missing',409);
      }
    }
    if(command.action==='delete') {
      const checks=command.kind==='roles'?[db.collection('users').where('roleIds','array-contains',command.id)]:
        command.kind==='plans'?[db.collection('brands').where('subscriptionPlanId','==',command.id),db.collection('subscriptions').where('planId','==',command.id)]:
        [db.collection('brands').where('ownerId','==',command.id)];
      for(const query of checks) if(!(await tx.get(query.limit(1))).empty) throw new PlatformAdminError('record_in_use',409);
    }
    if(command.action==='delete') tx.delete(ref);
    else tx.set(ref,{...data,id:ref.id},{merge:true});
    tx.set(lockRef,{lastRequestId:command.requestId});
    tx.set(eventRef,{actorId,organizationId,action:command.action,kind:command.kind,recordId:ref.id,fingerprint,createdAt:new Date().toISOString()});
    return {ok:true,id:ref.id};
  });
}
