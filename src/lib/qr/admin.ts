import { z } from 'zod';
import { applyUtm, buildStaticPayload, normalizeDestination, type QrStaticInput, type UtmTags } from './payload';
import { renderQr } from './render';
import { qrPrintHtml } from './print';
import { createQrStore, QrStoreError, type QrDatabase, type QrRecord, type QrScope } from './store';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const style=z.object({width:z.number().int().min(128).max(4096),margin:z.number().int().min(4).max(32),dark:z.string().regex(/^#[a-f0-9]{6}$/i),light:z.string().regex(/^#[a-f0-9]{6}$/i),errorCorrectionLevel:z.enum(['L','M','Q','H'])}).strict();
const utm=z.object({source:z.string().max(200),medium:z.string().max(200),campaign:z.string().max(200),content:z.string().max(200),term:z.string().max(200)}).strict();
export const qrDraftSchema=z.object({name:z.string().max(160),brandId:id,locationId:id.nullable(),kind:z.enum(['dynamic','static']),destination:z.string().max(2000),staticType:z.enum(['url','text','wifi','vcard','email','phone','sms']),fields:z.record(z.string().max(2000)),campaign:z.string().max(160),tags:z.array(z.string().max(50)).max(20),utm,expiresAt:z.number().int().positive().nullable().optional(),style:style.optional()}).strict();
export type QrAdminDraft=z.infer<typeof qrDraftSchema>;
export type QrAdminContext={id?:string;revision?:string;requestId?:string};
const context=z.object({id:id.optional(),revision:z.string().regex(/^[1-9][0-9]{0,9}$/).optional(),requestId:z.string().uuid().optional()}).strict();
export const qrCommandSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}).strict(),
 z.object({action:z.literal('save'),draft:qrDraftSchema,context}).strict(),
 z.object({action:z.literal('status'),brandId:id,id,locationId:id.nullable(),status:z.enum(['active','paused','archived']),revision:z.string().regex(/^[1-9][0-9]{0,9}$/),requestId:z.string().uuid()}).strict(),
 z.object({action:z.literal('render'),draft:qrDraftSchema,context,format:z.enum(['preview','png','svg','print'])}).strict(),
]);
export type QrCommand=z.infer<typeof qrCommandSchema>;
export type QrAction='view'|'create'|'edit'|'archive'|'export'|'analytics';
export type QrAdminDependencies={db:QrDatabase;actorId:string;authorize:(action:QrAction,brandId:string,locationId:string|null)=>Promise<QrScope>;
 list:()=>Promise<unknown>};

export function qrSummary(record:QrRecord) {
 const url=new URL(record.destination),tags:Record<string,string>={};
 for(const k of ['source','medium','campaign','content','term'])tags[k]=url.searchParams.get(`utm_${k}`)||'';
 return {name:record.name,brandId:record.brandId,locationId:record.locationId,kind:'dynamic' as const,destination:record.destination,staticType:'url' as const,fields:{},campaign:record.campaign,tags:record.tags,utm:tags,
 expiresAt:record.expiresAt,style:record.design,id:record.id,revision:String(record.revision),status:record.status,publicUrl:`https://orderfly.dk/q/${record.slug}`};
}
function staticPayload(draft:QrAdminDraft):string {
 const f=draft.fields;
 const data:QrStaticInput=draft.staticType==='url'?{type:'url',url:draft.destination,utm:cleanUtm(draft.utm)}
  :draft.staticType==='text'?{type:'text',text:f.text}
  :draft.staticType==='wifi'?{type:'wifi',ssid:f.ssid,password:f.password,security:f.security as 'WPA'|'WEP'|'nopass'}
  :draft.staticType==='vcard'?{type:'vcard',firstName:f.name,lastName:'',organization:f.organization,phone:f.phone||undefined,email:f.email||undefined}
  :draft.staticType==='email'?{type:'email',to:f.to,subject:f.subject,body:f.body}
  :draft.staticType==='phone'?{type:'phone',phone:f.phone}:{type:'sms',phone:f.phone,body:f.body};
 return buildStaticPayload(data);
}
const cleanUtm=(tags:QrAdminDraft['utm']):UtmTags=>Object.fromEntries(Object.entries(tags).filter(([,v])=>v!==''));

/** Native session/action authorization is mandatory for EVERY request, including receipt replay. */
export function createQrAdminService(deps:QrAdminDependencies) {
 const store=createQrStore(deps.db,{normalizeDestination});
 async function scoped(action:QrAction,brandId:string,locationId:string|null) {
  const scope=await deps.authorize(action,brandId,locationId);
  if(scope.brandId!==brandId||scope.actorId!==deps.actorId||scope.locationIds!==null&&(locationId===null||!scope.locationIds.includes(locationId)))throw new QrStoreError('forbidden',403);
  return scope;
 }
 return async function execute(raw:unknown) {
  const c=qrCommandSchema.parse(raw);
  if(c.action==='list')return deps.list();
  if(c.action==='status'){
   const scope=await scoped(c.status==='archived'?'archive':'edit',c.brandId,c.locationId);
   const current=await store.get(scope,c.id);
   if(current.locationId!==c.locationId)throw new QrStoreError('forbidden',403);
   const run=c.status==='archived'?store.archive:c.status==='paused'?store.pause:store.activate;
   return qrSummary(await run(scope,c.id,Number(c.revision),c.requestId));
  }
  const draft=c.draft;
  if(c.action==='save'){
   if(draft.kind!=='dynamic'||!c.context.requestId||!!c.context.id!==!!c.context.revision)throw new QrStoreError('invalid_input');
   const scope=await scoped(c.context.id?'edit':'create',draft.brandId,draft.locationId);
   if(c.context.id){
    const current=await store.get(scope,c.context.id);
    await scoped('edit',current.brandId,current.locationId);
   }
   // Validate styles against the fixed-length permanent link before persisting.
   await renderQr(`https://orderfly.dk/q/${'0'.repeat(32)}`,draft.style);
   const input={name:draft.name,destination:applyUtm(draft.destination,cleanUtm(draft.utm)),locationId:draft.locationId,campaign:draft.campaign,tags:draft.tags,expiresAt:draft.expiresAt,design:draft.style};
   const row=c.context.id?await store.update(scope,c.context.id,input,Number(c.context.revision),c.context.requestId):await store.create(scope,input,c.context.requestId);
   return qrSummary(row);
  }
  const scope=await scoped(c.format==='preview'?'view':'export',draft.brandId,draft.locationId);
  let payload:string;
  if(draft.kind==='dynamic'){
   if(!c.context.id||!c.context.revision)throw new QrStoreError('save_required',409);
   const record=await store.get(scope,c.context.id);
   if(String(record.revision)!==c.context.revision||record.locationId!==draft.locationId)throw new QrStoreError('revision_conflict',409);
   payload=`https://orderfly.dk/q/${record.slug}`;
  }else payload=staticPayload(draft);
  const rendered=await renderQr(payload,draft.style);
  if(c.format==='preview')return {payload,imageUrl:`data:image/png;base64,${rendered.png.toString('base64')}`};
  if(c.format==='print')return {content:qrPrintHtml(rendered,{title:draft.name}),mime:'text/html',filename:'qr-print.html'};
  return {content:c.format==='png'?rendered.png.toString('base64'):rendered.svg,mime:c.format==='png'?'image/png':'image/svg+xml',encoding:c.format==='png'?'base64':'utf8',filename:`qr-code.${c.format}`};
 };
}
