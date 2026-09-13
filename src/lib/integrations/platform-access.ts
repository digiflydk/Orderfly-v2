import { z } from 'zod';

// Configuration vocabulary, not a mapping to existing runtime permissions.
export const ACCESS_MODULES = [
  {id:'orderfly.orders',name:'Orderfly · Orders'},
  {id:'orderfly.catalog',name:'Orderfly · Catalog'},
  {id:'orderfly.billing',name:'Orderfly · Billing'},
  {id:'opsfly.production',name:'Opsfly · Production'},
  {id:'opsfly.hr',name:'Opsfly · HR'},
  {id:'opsfly.training',name:'Opsfly · Training'},
] as const;
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const name=z.string().trim().min(2).max(160);
const unique=(values:string[])=>new Set(values).size===values.length;
const ids=z.array(id).max(50).refine(unique);
const moduleId=z.string().refine(v=>ACCESS_MODULES.some(m=>m.id===v));
export const ACCESS_PERMISSIONS=ACCESS_MODULES.flatMap(m=>['view','manage'].map(action=>({id:`${m.id}:${action}`,name:`${m.name} · ${action}`})));
export const accessSchemas={
  companies:z.object({name,orderflyBrandIds:ids,opsflyOrganizationId:z.string().uuid().nullable(),planId:id.nullable(),status:z.enum(['active','suspended']),expiresAt:z.string().datetime().nullable()}).strict(),
  accessPlans:z.object({name,modules:z.array(moduleId).max(50).refine(unique),isActive:z.boolean()}).strict(),
  accessRoles:z.object({name,permissions:z.array(z.string().refine(v=>ACCESS_PERMISSIONS.some(p=>p.id===v))).max(100).refine(unique),isActive:z.boolean()}).strict(),
  memberships:z.object({name,companyId:id,product:z.enum(['orderfly','opsfly']),principalId:id,principalOrganizationId:z.string().uuid().nullable(),roleIds:ids,isActive:z.boolean()}).strict().superRefine((v,ctx)=>{
    if(v.product==='opsfly'&&(!v.principalOrganizationId||!z.string().uuid().safeParse(v.principalId).success))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Opsfly requires employee and organization UUIDs'});
    if(v.product==='orderfly'&&v.principalOrganizationId!==null)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Orderfly identity has no Opsfly organization'});
  }),
};
export const accessCollections={companies:'platformCompanies',accessPlans:'platformAccessPlans',accessRoles:'platformAccessRoles',memberships:'platformMemberships'} as const;
export type AccessKind=keyof typeof accessSchemas;
export const previewSchema=z.object({action:z.literal('preview'),companyId:id,product:z.enum(['orderfly','opsfly']),principalId:id,module:moduleId,permission:z.enum(['view','manage'])}).strict();

// Input is one transactionally consistent catalogue. No browser-supplied role grants.
export function evaluateAccess(catalog:Record<AccessKind,any[]>,query:z.infer<typeof previewSchema>,now=Date.now()) {
  const deny=(reason:string)=>({ok:true,allowed:false,reason,mode:'preview' as const});
  if(!Number.isFinite(now))return deny('invalid_time');
  if(!query.module.startsWith(query.product+'.'))return deny('product_mismatch');
  const company=catalog.companies.find(c=>c.id===query.companyId);
  if(!company||company.status!=='active')return deny('company_inactive');
  if(company.expiresAt!==null&&(!Number.isFinite(Date.parse(company.expiresAt))||Date.parse(company.expiresAt)<=now))return deny('subscription_expired');
  if(query.product==='opsfly'?!company.opsflyOrganizationId:!company.orderflyBrandIds?.length)return deny('product_unlinked');
  const plan=catalog.accessPlans.find(p=>p.id===company.planId);
  if(!plan?.isActive||!plan.modules.includes(query.module))return deny('module_not_in_plan');
  const members=catalog.memberships.filter(m=>m.companyId===company.id&&m.product===query.product&&m.principalId===query.principalId);
  if(members.length!==1||!members[0].isActive)return deny('membership_inactive');
  const member=members[0];
  if(query.product==='opsfly'&&member.principalOrganizationId!==company.opsflyOrganizationId)return deny('organization_mismatch');
  const roles=member.roleIds.map((rid:string)=>catalog.accessRoles.find(r=>r.id===rid));
  if(roles.some((r:any)=>!r))return deny('role_missing');
  // Manage is explicit; it does not silently imply view, and neither overrides subscription.
  if(!roles.some((r:any)=>r.isActive&&r.permissions.includes(`${query.module}:${query.permission}`)))return deny('permission_missing');
  return {ok:true,allowed:true,reason:'granted',mode:'preview' as const};
}
