import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { orderflySession, orderflyReadGrants, requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { createQrStore, type QrScope } from './store';
import { normalizeDestination } from './payload';
import { createQrAdminService, qrSummary, type QrAction } from './admin';
import { z } from 'zod';
import { createQrAnalyticsService, parseQrAnalyticsDates, exportQrAnalyticsCsv } from './analytics';
import { createHash } from 'node:crypto';
import { previewQrCsv } from './bulk';
import { createQrBulkStore } from './bulk-store';
import { QrStoreError } from './store';
import { readQrLifetime, type QrLifetime } from './lifetime';
import { createQrHistoryService } from './history';

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
 const analyticsGrants=session.superuser?null:await orderflyReadGrants(permission('analytics')).catch(error=>{if(error instanceof AuthorityError&&error.status===403)return [];throw error;});
 const allTime:Record<string,QrLifetime|null>={};
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
   if(session.superuser||analyticsGrants?.some(g=>g.brandId===grant.brandId&&g.locationIds===null)){
    for(const row of result.rows){
     const saved=(row as unknown as {lifetime?:unknown}).lifetime;
     try{allTime[`${row.brandId}/${row.id}`]=saved==null?null:readQrLifetime(saved);}catch{allTime[`${row.brandId}/${row.id}`]=null;}
    }
   }
   if(codes.length>2000){codes.splice(2000);truncated=true;break;}
  }
  if(codes.length>=2000)break;
 }
 const allowed=async(action:QrAction)=>{
  if(session.superuser)return true;
  try{return (await orderflyReadGrants(permission(action))).length>0;}catch(error){if(error instanceof AuthorityError&&error.status===403)return false;throw error;}
 };
 const [create,edit,archive,exportCodes,analytics]=await Promise.all(['create','edit','archive','export','analytics'].map(a=>allowed(a as QrAction)));
 return {brands,codes,allTime,capabilities:{create,edit,archive,export:exportCodes},analytics,truncated,dynamicEnabled:process.env.QR_MODULE_ENABLED==='true'};
}

export async function executeQrCommand(command:unknown) {
 const {session,db,authorize}=await qrRuntime();
 if(command&&typeof command==='object'&&'action' in command&&['bulk_preview','bulk_commit'].includes(String(command.action))){
  const key=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
  const schema=z.discriminatedUnion('action',[
   z.object({action:z.literal('bulk_preview'),brandId:key,csv:z.string().max(128*1024)}).strict(),
   z.object({action:z.literal('bulk_commit'),brandId:key,canonical:z.string().max(256*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),requestId:z.string().uuid()}).strict(),
  ]);
  const c=schema.parse(command);
  if(process.env.QR_MODULE_ENABLED!=='true')throw new QrStoreError('feature_disabled',400);
  const scope=session.superuser?await authorize('create',c.brandId,null):await(async()=>{
   const grant=(await orderflyReadGrants(permission('create'))).find(g=>g.brandId===c.brandId);
   if(!grant)throw new AuthorityError('forbidden');
   return {brandId:c.brandId,locationIds:grant.locationIds,actorId:session.actorId};
  })();
  if(c.action==='bulk_preview'){
   const activeLocations=scope.locationIds===null
    ?(await db.collection('locations').where('brandId','==',scope.brandId).limit(501).get()).docs
    :null;
   if(activeLocations&&activeLocations.length>500)throw new AuthorityError('catalog_too_large',503);
   const locationIds=activeLocations?activeLocations.filter(d=>d.data()?.brandId===scope.brandId&&d.data()?.isActive===true).map(d=>d.id):scope.locationIds!;
   const preview=previewQrCsv(c.csv,{allowedScopes:[{brandId:scope.brandId,locationIds,allowBrandWide:scope.locationIds===null}]});
   return {...preview,plan:preview.plan?{...preview.plan,sha256:createHash('sha256').update(preview.plan.canonical).digest('hex')}:null};
  }
  const result=await createQrBulkStore(db,{authorizeCreate:async(s,loc)=>{await requireOrderflyAccess(s.brandId,loc===null?null:[loc],permission('create'));}}).create(scope,{canonical:c.canonical,sha256:c.sha256,requestId:c.requestId});
  return {...result,records:result.records.map(qrSummary)};
 }
 if(command&&typeof command==='object'&&'action' in command&&command.action==='history'){
  const key=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
  const c=z.object({action:z.literal('history'),brandId:key,locationId:key.nullable(),id:key}).strict().parse(command);
  const scope=await authorize('view',c.brandId,c.locationId),store=createQrStore(db,{normalizeDestination});
  return createQrHistoryService(db,{getCode:async(s,id)=>{
   const row=await store.get(s,id);
   if(row.locationId!==c.locationId)throw new AuthorityError('forbidden');
   return row;
  }}).read(scope,c.id);
 }
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
 const execute=createQrAdminService({db,actorId:session.actorId,dynamicEnabled:process.env.QR_MODULE_ENABLED==='true',authorize,list:loadQrWorkspace});
 return execute(command);
}
