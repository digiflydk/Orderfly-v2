import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { orderflySession, orderflyReadGrants, requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { createQrStore, type QrScope } from './store';
import { normalizeDestination } from './payload';
import { createQrAdminService, qrSummary, type QrAction } from './admin';
import { z } from 'zod';
import { createQrAnalyticsService, parseQrAnalyticsDates, exportQrAnalyticsCsv } from './analytics';

const permission=(action:QrAction)=>`orderfly.qr_codes:${action}`;
export async function qrRuntime() {
 const session=await orderflySession(),db=getAdminDb();
 const authorize=async(action:QrAction,brandId:string,locationId:string|null):Promise<QrScope>=>{
  await requireOrderflyAccess(brandId,locationId===null?null:[locationId],permission(action));
  if(session.superuser)return {brandId,actorId:session.actorId,locationIds:null};
  const grant=(await orderflyReadGrants(permission(action))).find(g=>g.brandId===brandId);
  if(!grant)throw new AuthorityError('forbidden');
  return {brandId,actorId:session.actorId,locationIds:grant.locationIds};
 };
 return {session,db,authorize};
}

/** Explicitly privileged cross-brand directory reads are restricted to a verified central superuser. */
export async function loadQrWorkspace() {
 const {session,db}=await qrRuntime(),store=createQrStore(db,{normalizeDestination});
 const grants=session.superuser
  ? (await db.collection('brands').limit(501).get()).docs.map(d=>({brandId:d.id,locationIds:null as string[]|null}))
  : await orderflyReadGrants(permission('view'));
 if(grants.length>500)throw new AuthorityError('catalog_too_large',503);
 const brands:Array<{id:string;name:string;allowWholeBrand:boolean;locations:Array<{id:string;name:string}>}>=[],codes:ReturnType<typeof qrSummary>[]=[];
 let truncated=false;
 for(const grant of grants){
  const brand=await db.collection('brands').doc(grant.brandId).get();
  if(!brand.exists)continue;
  const all=grant.locationIds===null?(await db.collection('locations').where('brandId','==',grant.brandId).limit(501).get()).docs
   :await Promise.all(grant.locationIds.map(id=>db.collection('locations').doc(id).get()));
  if(all.length>500)throw new AuthorityError('catalog_too_large',503);
  const locations=all.filter(d=>d.exists&&d.data()?.brandId===grant.brandId&&d.data()?.isActive===true).map(d=>({id:d.id,name:String(d.data()?.name||d.id)}));
  brands.push({id:brand.id,name:String(brand.data()?.name||brand.id),allowWholeBrand:grant.locationIds===null,locations});
  const scope={brandId:grant.brandId,locationIds:grant.locationIds,actorId:session.actorId};
  for(const locationId of [...(grant.locationIds===null?[null]:[]),...locations.map(l=>l.id)]){
   const result=await store.list(scope,{locationId});truncated ||= result.truncated;
   codes.push(...result.rows.map(qrSummary));
   if(codes.length>2000){codes.splice(2000);truncated=true;break;}
  }
  if(codes.length>=2000)break;
 }
 const allowed=async(action:QrAction)=>{
  if(session.superuser)return true;
  try{return (await orderflyReadGrants(permission(action))).length>0;}catch(error){if(error instanceof AuthorityError&&error.status===403)return false;throw error;}
 };
 const [create,edit,archive,exportCodes,analytics]=await Promise.all(['create','edit','archive','export','analytics'].map(a=>allowed(a as QrAction)));
 return {brands,codes,capabilities:{create,edit,archive,export:exportCodes},analytics,truncated};
}

export async function executeQrCommand(command:unknown) {
 const {session,db,authorize}=await qrRuntime();
 if(command&&typeof command==='object'&&'action' in command&&command.action==='analytics'){
  const key=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
  const c=z.object({action:z.literal('analytics'),brandId:key,locationId:key.nullable(),id:key,from:z.string(),to:z.string(),export:z.boolean().optional()}).strict().parse(command);
  const scope=await authorize('analytics',c.brandId,c.locationId);
  if(c.export)await authorize('export',c.brandId,c.locationId);
  const store=createQrStore(db,{normalizeDestination});
  const result=await createQrAnalyticsService(db,{getCode:async(s,id)=>{
   const row=await store.get(s,id);
   if(row.locationId!==c.locationId)throw new AuthorityError('forbidden');
   return row;
  }}).read(scope,c.id,parseQrAnalyticsDates({from:c.from,to:c.to}));
  return c.export?{csv:exportQrAnalyticsCsv(result),filename:'qr-analytics.csv'}:result;
 }
 const execute=createQrAdminService({db,actorId:session.actorId,authorize,list:loadQrWorkspace});
 return execute(command);
}
