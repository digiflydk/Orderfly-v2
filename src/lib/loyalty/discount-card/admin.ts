import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { COLLECTIONS, hashKey, memberIdentityKey } from '@/lib/loyalty/stamp-card/model';
import { DISCOUNT_CARD_COLLECTIONS as C, discountCardAssignmentId } from './model';
import { defaultDiscountCardFeature, discountCardIdSchema, discountCardFeatureSchema, discountCardGroupSchema, discountCardAssignmentSchema, saveDiscountCardFeatureSchema, saveDiscountCardGroupSchema, saveDiscountCardAssignmentSchema } from './rules';
import type { DiscountCardAdminData } from './types';
export type DiscountCardActor = { identity: VerifiedIdentity; name: string };
const reject = (code:string,status=409):never => { throw new AuthorityError(code,status); };
/** Rechecks native platform authority and active company mapping in the write transaction. */
export async function requireDiscountCardSuperuserBrand(db:Firestore,tx:Transaction,identity:VerifiedIdentity,brandId:string) {
  if(!discountCardIdSchema.safeParse(brandId).success) return reject('invalid_identifier',400);
  const [policyDoc,brandDoc]=await Promise.all([tx.get(db.collection('platformAdminControl').doc('access-v1')),tx.get(db.collection('brands').doc(brandId))]);
  const policy=policySchema.safeParse(policyDoc.data()),brand=brandDoc.data();
  if(!policy.success||!isSuperuser(policy.data,principalKey(identity))||!brand||brand.status==='suspended'||brand.status==='inactive')return reject('forbidden',403);
  const companies=policy.data.companies.filter(c=>c.active&&c.orderflyBrandIds.includes(brandId));
  if(companies.length!==1)return reject('forbidden',403);
  return {companyId:companies[0].id,brand};
}
function checked<T extends {brandId:string;companyId:string}>(schema:z.ZodType<T>,raw:unknown,brandId:string,companyId:string):T {
 const p=schema.safeParse(raw);if(!p.success||p.data.brandId!==brandId||p.data.companyId!==companyId)return reject('invalid_record');return p.data;
}
function assertVersion(current:{version:number}|null,expected:number) {if((current?.version??0)!==expected)reject('record_changed');}
function audit(db:Firestore,tx:Transaction,actor:DiscountCardActor,kind:string,id:string,brandId:string,companyId:string,version:number,before:unknown,after:unknown,now:number) {
 tx.create(db.collection(C.audit).doc(hashKey('discount-card-audit',kind,id,String(version))),{kind,id,brandId,companyId,version,before,after,actorId:principalKey(actor.identity),actorName:actor.name,createdAt:now});
}
function assertNow(now:number) {if(!Number.isSafeInteger(now)||now<0||now>8.64e15)reject('invalid_time',400);}
export async function readDiscountCardAdmin(db:Firestore,actor:DiscountCardActor,brandId:string,customerQuery=''):Promise<DiscountCardAdminData> {
 return db.runTransaction(async tx=>{
  const {companyId}=await requireDiscountCardSuperuserBrand(db,tx,actor.identity,brandId);
  const email=customerQuery.trim().toLowerCase();
  if(email&&!z.string().email().max(254).safeParse(email).success)reject('invalid_customer_search',400);
  const customerBase=db.collection('customers').where('brandId','==',brandId);
  const [f,g,a,l,c,legacy]=await Promise.all([
   tx.get(db.collection(C.features).doc(brandId)),tx.get(db.collection(C.groups).where('brandId','==',brandId).limit(501)),
   tx.get(db.collection(C.assignments).where('brandId','==',brandId).limit(501)),tx.get(db.collection('locations').where('brandId','==',brandId).limit(501)),
   tx.get((email?customerBase.where('normalizedEmail','==',email):customerBase).limit(201)),
   email?tx.get(customerBase.where('email','==',email).limit(201)):Promise.resolve(null),
  ]);
  if(g.docs.length>500||l.docs.length>500)reject('catalog_too_large');
  const feature=f.exists?checked(discountCardFeatureSchema,f.data(),brandId,companyId):defaultDiscountCardFeature(brandId,companyId);
  const customersById=new Map([...c.docs,...(legacy?.docs??[])].map(d=>[d.id,d]));
  const assignmentDocs = email ? await Promise.all([...customersById.keys()].slice(0,200).map(customerId=>tx.get(db.collection(C.assignments).doc(discountCardAssignmentId(brandId,customerId))))) : a.docs;
  const customers=await Promise.all([...customersById.values()].slice(0,200).filter(d=>d.data().status!=='inactive').map(async d=>{
   const customer=d.data(),email=String(customer.normalizedEmail||customer.email||'').trim().toLowerCase();
   const identity=email?(await tx.get(db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brandId,email)))).data():null;
   const member=identity&&typeof identity.memberId==='string'?(await tx.get(db.collection(COLLECTIONS.members).doc(identity.memberId))).data():null;
   const memberId=member&&member.status==='active'&&member.brandId===brandId&&member.companyId===companyId&&member.customerId===d.id?identity!.memberId:null;
   return {id:d.id,name:String(customer.fullName||''),email,memberId};
  }));
  return {feature,groups:g.docs.map(d=>{const row=checked(discountCardGroupSchema,d.data(),brandId,companyId);if(row.id!==d.id)reject('invalid_record');return row;}),
   assignments:assignmentDocs.filter(d=>d.exists).slice(0,500).map(d=>{const row=checked(discountCardAssignmentSchema,d.data(),brandId,companyId);if(row.id!==d.id||d.id!==discountCardAssignmentId(brandId,row.customerId))reject('invalid_record');return row;}),
   locations:l.docs.filter(d=>d.data().isActive!==false).map(d=>({id:d.id,name:String(d.data().name||d.id)})),customers,
   customersTruncated:customersById.size>200,assignmentsTruncated:!email&&a.docs.length>500};
 });
}
export async function saveDiscountCardFeature(db:Firestore,actor:DiscountCardActor,input:z.infer<typeof saveDiscountCardFeatureSchema>,now=Date.now()) {
 const p=saveDiscountCardFeatureSchema.parse(input);assertNow(now);
 return db.runTransaction(async tx=>{
  const {companyId}=await requireDiscountCardSuperuserBrand(db,tx,actor.identity,p.brandId),ref=db.collection(C.features).doc(p.brandId),doc=await tx.get(ref);
  const current=doc.exists?checked(discountCardFeatureSchema,doc.data(),p.brandId,companyId):null;assertVersion(current,p.version);
  for(const locationId of p.locationScope.locationIds){const l=(await tx.get(db.collection('locations').doc(locationId))).data();if(!l||l.brandId!==p.brandId||l.isActive===false)reject('invalid_location',400);}
  const next=discountCardFeatureSchema.parse({...p,companyId,version:p.version+1,updatedAt:now});
  tx.set(ref,next);audit(db,tx,actor,'feature',p.brandId,p.brandId,companyId,next.version,current,next,now);return next;
 });
}
export async function saveDiscountCardGroup(db:Firestore,actor:DiscountCardActor,input:z.infer<typeof saveDiscountCardGroupSchema>,now=Date.now()) {
 const p=saveDiscountCardGroupSchema.parse(input);assertNow(now);
 return db.runTransaction(async tx=>{
  const {companyId}=await requireDiscountCardSuperuserBrand(db,tx,actor.identity,p.brandId),ref=db.collection(C.groups).doc(p.id),doc=await tx.get(ref);
  const current=doc.exists?checked(discountCardGroupSchema,doc.data(),p.brandId,companyId):null;
  if(current&&current.id!==p.id)reject('invalid_record');assertVersion(current,p.version);
  const next=discountCardGroupSchema.parse({...p,companyId,version:p.version+1,updatedAt:now});
  tx.set(ref,next);audit(db,tx,actor,'group',p.id,p.brandId,companyId,next.version,current,next,now);return next;
 });
}
export async function saveDiscountCardAssignment(db:Firestore,actor:DiscountCardActor,input:z.infer<typeof saveDiscountCardAssignmentSchema>,now=Date.now()) {
 const p=saveDiscountCardAssignmentSchema.parse(input);assertNow(now);
 return db.runTransaction(async tx=>{
  const {companyId}=await requireDiscountCardSuperuserBrand(db,tx,actor.identity,p.brandId),id=discountCardAssignmentId(p.brandId,p.customerId),ref=db.collection(C.assignments).doc(id);
  const [doc,customerDoc,groupDoc,memberDoc]=await Promise.all([tx.get(ref),tx.get(db.collection('customers').doc(p.customerId)),tx.get(db.collection(C.groups).doc(p.groupId)),p.memberId?tx.get(db.collection(COLLECTIONS.members).doc(p.memberId)):Promise.resolve(null)]);
  const current=doc.exists?checked(discountCardAssignmentSchema,doc.data(),p.brandId,companyId):null;
  if(current&&(current.id!==id||current.customerId!==p.customerId))reject('invalid_record');assertVersion(current,p.version);
  const customer=customerDoc.data();if(!customer||customer.brandId!==p.brandId||customer.status==='inactive')reject('invalid_customer',400);
  const group=checked(discountCardGroupSchema,groupDoc.data(),p.brandId,companyId);if(group.id!==p.groupId)reject('invalid_group',400);
  const member=memberDoc?.data();if(p.memberId&&(!member||member.brandId!==p.brandId||member.companyId!==companyId||member.customerId!==p.customerId||member.status!=='active'))reject('invalid_member',400);
  if(p.status==='active'&&!p.memberId)reject('member_verification_required',400);
  const next=discountCardAssignmentSchema.parse({...p,id,companyId,version:p.version+1,updatedAt:now});
  tx.set(ref,next);audit(db,tx,actor,'assignment',id,p.brandId,companyId,next.version,current,next,now);return next;
 });
}
