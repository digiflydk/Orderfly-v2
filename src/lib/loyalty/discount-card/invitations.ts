import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { policySchema } from '@/lib/access/policy';
import { customerIdentityKey } from '@/lib/customer-identity';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { brandSubdomainUrl } from '@/lib/brand-subdomain';
import { LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { consumeLimit, RateLimited } from '@/lib/loyalty/stamp-card/limits';
import { COLLECTIONS, hashKey, memberIdentityKey, readProgram, type MemberDoc } from '@/lib/loyalty/stamp-card/model';
import type { ProgramBrand, RequestContext } from '@/lib/loyalty/stamp-card/membership';
import { loyaltyMailConfig } from '@/lib/loyalty/stamp-card/mail';
import { requireDiscountCardSuperuserBrand } from './admin';
import { DISCOUNT_CARD_COLLECTIONS as C, assignmentId } from './model';
import { discountCardIdSchema, discountCardAssignmentSchema, discountCardFeatureSchema, discountCardGroupSchema } from './rules';

export const INVITATIONS = { tokens:'discountCardInvitations', identities:'discountCardInvitationIdentities', outbox:'discountCardInvitationOutbox' } as const;
export const INVITATION_LIFETIME = 48 * 60 * 60_000;
export const DISCOUNT_CARD_TERMS_VERSION = 'discount-card-terms-v1';
export const DISCOUNT_CARD_TERMS = 'Rabatkortet er personligt og må ikke deles. Rabatten gælder kvalificerende varer hos de viste lokationer og kan ikke kombineres med andre tilbud. Levering og gebyrer er ikke omfattet. Kortet kan ændres, udløbe eller spærres af udstederen. Aktivering tilmelder dig ikke nyhedsbreve.';
const token = z.string().regex(/^[a-f0-9]{64}$/);
const epoch = z.number().int().nonnegative().max(8.64e15);
const version = z.number().int().nonnegative();
export const inviteDiscountCardSchema = z.union([
 z.object({brandId:discountCardIdSchema,customerId:discountCardIdSchema,expectedVersion:version}).strict(),
 z.object({brandId:discountCardIdSchema,name:z.string().trim().min(1).max(100),email:z.string().trim().email().max(254),groupId:discountCardIdSchema,startsAt:epoch.nullable(),expiresAt:epoch.nullable()}).strict().refine(v=>v.startsAt===null||v.expiresAt===null||v.expiresAt>v.startsAt),
]);
export const inspectDiscountInvitationSchema = z.object({token}).strict();
export const acceptDiscountInvitationSchema = z.object({token,termsAccepted:z.literal(true),termsVersion:z.literal(DISCOUNT_CARD_TERMS_VERSION)}).strict();
type Actor = {identity:VerifiedIdentity;name:string};
export type DiscountInvitation = { brandId:string;companyId:string;customerId:string|null;assignmentVersion:number|null;groupId:string;groupVersion:number;featureVersion:number;email:string;name:string;startsAt:number|null;endsAt:number|null;createdAt:number;expiresAt:number;usedAt:number|null;identityId:string;revokedAt:number|null };
const primary = (c:Record<string,unknown>|undefined) => normalizeEmail(typeof c?.normalizedEmail==='string'?c.normalizedEmail:typeof c?.email==='string'?c.email:'');
export const discountInvitationUrl = (slug:string,value:string) => `${brandSubdomainUrl(slug)}/club/invitation#token=${value}`;

// Only superadmin can nominate a recipient. New-customer records are deferred
// until the recipient proves mailbox possession and explicitly accepts terms.
export async function inviteDiscountCard(db:Firestore,actor:Actor,raw:z.infer<typeof inviteDiscountCardSchema>,now=Date.now()) {
 const input=inviteDiscountCardSchema.parse(raw);
 return db.runTransaction(async tx=>{
  const {companyId,brand}=await requireDiscountCardSuperuserBrand(db,tx,actor.identity,input.brandId);
  const feature=discountCardFeatureSchema.safeParse((await tx.get(db.collection(C.features).doc(input.brandId))).data());
  if(!feature.success||feature.data.brandId!==input.brandId||!feature.data.enabled||feature.data.companyId!==companyId)throw new AuthorityError('feature_inactive',409);
  if(!loyaltyMailConfig(input.brandId))throw new AuthorityError('mail_configuration_required',409);
  let customerId:string|null=null,assignmentVersion:number|null=null,email:string,name:string,groupId:string,startsAt:number|null,endsAt:number|null;
  if('customerId' in input){
   const a=discountCardAssignmentSchema.safeParse((await tx.get(db.collection(C.assignments).doc(assignmentId(input.brandId,input.customerId)))).data());
   const c=(await tx.get(db.collection('customers').doc(input.customerId))).data();
   if(!a.success||a.data.brandId!==input.brandId||a.data.companyId!==companyId||a.data.customerId!==input.customerId||a.data.status==='blocked'||c?.brandId!==input.brandId||(c?.deletedAt!=null||['inactive','deleted'].includes(String(c?.status))))throw new AuthorityError('assignment_invalid',409);
   if(a.data.version!==input.expectedVersion)throw new AuthorityError('record_changed',409);
   customerId=input.customerId;assignmentVersion=a.data.version;email=primary(c);name=String(c?.fullName||c?.name||'').slice(0,100)||email;
   groupId=a.data.groupId;startsAt=a.data.startsAt;endsAt=a.data.expiresAt;
  }else{email=normalizeEmail(input.email);name=input.name;groupId=input.groupId;startsAt=input.startsAt;endsAt=input.expiresAt;}
  if(!z.string().email().safeParse(email).success||endsAt!==null&&endsAt<=now)throw new AuthorityError('invitation_invalid',409);
  const group=discountCardGroupSchema.safeParse((await tx.get(db.collection(C.groups).doc(groupId))).data());
  if(!group.success||!group.data.active||group.data.brandId!==input.brandId||group.data.companyId!==companyId)throw new AuthorityError('group_inactive',409);
  const slug=String(brand.slug||'');if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug))throw new AuthorityError('brand_invalid',409);
  const identityId=hashKey('discount-invite-identity',input.brandId,email),identityRef=db.collection(INVITATIONS.identities).doc(identityId);
  const previous=(await tx.get(identityRef)).data();
  const previousToken=previous?.invitationId?(await tx.get(db.collection(INVITATIONS.tokens).doc(String(previous.invitationId)))).data() as DiscountInvitation|undefined:undefined;
  const previousJob=previous?.invitationId?(await tx.get(db.collection(INVITATIONS.outbox).doc(String(previous.invitationId)))).data():undefined;
  const needsReissue=previousJob?.state==='uncertain'||previousJob?.state==='failed'&&previousJob.nextAttemptAt===Number.MAX_SAFE_INTEGER||previousJob?.state==='dispatching'&&Number(previousJob.updatedAt)+120_000<=now;
  const binding={brandId:input.brandId,companyId,customerId,assignmentVersion,groupId,groupVersion:group.data.version,featureVersion:feature.data.version,email,name,startsAt,endsAt};
  if(!needsReissue&&previousToken&&!previousToken.usedAt&&!previousToken.revokedAt&&previousToken.expiresAt>now&&Object.entries(binding).every(([k,v])=>previousToken[k as keyof DiscountInvitation]===v))return {ok:true as const,invitationId:String(previous!.invitationId),expiresAt:previousToken.expiresAt};
  const value=randomBytes(32).toString('hex'),id=hashKey('discount-invite-token',value),expiresAt=Math.min(now+INVITATION_LIFETIME,endsAt??Infinity);
  if(previous?.invitationId&&previousToken)tx.update(db.collection(INVITATIONS.tokens).doc(String(previous.invitationId)),{revokedAt:now});
  tx.set(identityRef,{brandId:input.brandId,invitationId:id,updatedAt:now});
  tx.create(db.collection(INVITATIONS.tokens).doc(id),{...binding,identityId,createdAt:now,expiresAt,usedAt:null,revokedAt:null});
  tx.create(db.collection(INVITATIONS.outbox).doc(id),{brandId:input.brandId,invitationId:id,email,name,brandName:String(brand.name||slug),groupName:group.data.name,percentage:group.data.percentage,invitationUrl:discountInvitationUrl(slug,value),expiresAt,state:'pending',attempts:0,nextAttemptAt:now,createdAt:now});
  tx.create(db.collection(C.audit).doc(hashKey('discount-invited',id)),{brandId:input.brandId,companyId,kind:'invitation',invitationId:id,actorId:principalKey(actor.identity),actorName:actor.name,createdAt:now});
  return {ok:true as const,invitationId:id,expiresAt};
 });
}

export async function readValidDiscountInvitation(db:Firestore,tx:Transaction,brandId:string,id:string,now:number) {
 const invite=(await tx.get(db.collection(INVITATIONS.tokens).doc(id))).data() as DiscountInvitation|undefined;
 if(!invite||invite.brandId!==brandId||invite.usedAt!==null||invite.revokedAt!==null)throw new LoyaltyError('link_invalid',410);
 if(invite.expiresAt<=now)throw new LoyaltyError('link_expired',410);
 const [pointer,featureDoc,groupDoc,policyDoc,brandDoc]=await Promise.all([
  tx.get(db.collection(INVITATIONS.identities).doc(invite.identityId)),tx.get(db.collection(C.features).doc(brandId)),tx.get(db.collection(C.groups).doc(invite.groupId)),tx.get(db.collection('platformAdminControl').doc('access-v1')),tx.get(db.collection('brands').doc(brandId)),
 ]);
 const feature=discountCardFeatureSchema.safeParse(featureDoc.data()),group=discountCardGroupSchema.safeParse(groupDoc.data()),policy=policySchema.safeParse(policyDoc.data());
 if(pointer.data()?.invitationId!==id||!feature.success||!feature.data.enabled||feature.data.version!==invite.featureVersion||feature.data.brandId!==brandId||feature.data.companyId!==invite.companyId||!group.success||!group.data.active||group.data.id!==invite.groupId||group.data.brandId!==brandId||group.data.companyId!==invite.companyId||group.data.version!==invite.groupVersion||!brandDoc.exists||(brandDoc.data()?.deletedAt!=null||['suspended','inactive','deleted'].includes(String(brandDoc.data()?.status)))||!policy.success||policy.data.companies.filter(c=>c.active&&c.orderflyBrandIds.includes(brandId)).length!==1||!policy.data.companies.some(c=>c.id===invite.companyId&&c.active&&c.orderflyBrandIds.includes(brandId)))throw new LoyaltyError('link_invalid',410);
 if(invite.customerId){
  const a=discountCardAssignmentSchema.safeParse((await tx.get(db.collection(C.assignments).doc(assignmentId(brandId,invite.customerId)))).data());
  const customer=(await tx.get(db.collection('customers').doc(invite.customerId))).data();
  if(!a.success||a.data.brandId!==brandId||a.data.companyId!==invite.companyId||a.data.customerId!==invite.customerId||a.data.version!==invite.assignmentVersion||a.data.status==='blocked'||customer?.brandId!==brandId||primary(customer)!==invite.email||(customer?.deletedAt!=null||['inactive','deleted'].includes(String(customer?.status))))throw new LoyaltyError('link_invalid',410);
 }
 return {invite,feature:feature.data,group:group.data};
}

async function recipientCustomer(db:Firestore,tx:Transaction,invite:DiscountInvitation){
 const identityRef=db.collection('integrationConsumerCustomerIdentities').doc(customerIdentityKey(invite.brandId,invite.email));
 const reservation=(await tx.get(identityRef)).data();
 const results=await Promise.all([...['normalizedEmail','email'].map(field=>tx.get(db.collection('customers').where('brandId','==',invite.brandId).where(field,'==',invite.email).limit(2))),tx.get(db.collection('customers').where('brandId','==',invite.brandId).where('emailAliases','array-contains',invite.email).limit(2))]);
 const ids=new Set(results.flatMap(r=>r.docs.map(d=>d.id)));
 if(reservation){if(reservation.brandId!==invite.brandId||typeof reservation.customerId!=='string')throw new LoyaltyError('customer_conflict',409);ids.add(reservation.customerId);}
 if(invite.customerId)ids.add(invite.customerId);
 if(ids.size>1)throw new LoyaltyError('customer_conflict',409);
 const customerId=[...ids][0]||db.collection('customers').doc().id;
 const customer=(await tx.get(db.collection('customers').doc(customerId))).data();
 if(ids.size&&(!customer||customer.brandId!==invite.brandId||primary(customer)!==invite.email||(customer.deletedAt!=null||['inactive','deleted'].includes(String(customer.status)))))throw new LoyaltyError('customer_conflict',409);
 return {customerId,customer,identityRef,reservation};
}

export async function inspectDiscountInvitation(db:Firestore,brand:ProgramBrand,input:z.infer<typeof inspectDiscountInvitationSchema>,ctx:RequestContext){
 await invitationLimit(db,'discount-invite-inspect',brand,ctx);
 return db.runTransaction(async tx=>{
  const {invite,feature,group}=await readValidDiscountInvitation(db,tx,brand.brandId,hashKey('discount-invite-token',input.token),ctx.now);
  const locations=feature.locationScope.mode==='selected'?await Promise.all(feature.locationScope.locationIds.map(async id=>{const row=(await tx.get(db.collection('locations').doc(id))).data();if(!row||row.brandId!==brand.brandId||row.isActive===false)throw new LoyaltyError('link_invalid',410);return {id,name:String(row.name||id)};})):[];
  return {groupName:group.name,percentage:group.percentage,locationScope:feature.locationScope,locations,startsAt:invite.startsAt,expiresAt:invite.endsAt,terms:DISCOUNT_CARD_TERMS,termsVersion:DISCOUNT_CARD_TERMS_VERSION};
 }).catch(e=>{if(e instanceof RateLimited)throw new LoyaltyError('rate_limited',429);throw e;});
}

export async function acceptDiscountInvitation(db:Firestore,brand:ProgramBrand,raw:z.infer<typeof acceptDiscountInvitationSchema>,ctx:RequestContext){
 const input=acceptDiscountInvitationSchema.parse(raw),now=ctx.now;
 await invitationLimit(db,'discount-invite-accept',brand,ctx);
 return db.runTransaction(async tx=>{
  const id=hashKey('discount-invite-token',input.token),{invite}=await readValidDiscountInvitation(db,tx,brand.brandId,id,now);
  const c=await recipientCustomer(db,tx,invite),assignmentRef=db.collection(C.assignments).doc(assignmentId(brand.brandId,c.customerId));
  const current=(await tx.get(assignmentRef)).data();
  if(invite.customerId===null&&current)throw new LoyaltyError('assignment_exists',409);
  const identityRef=db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brand.brandId,invite.email));
  const identity=(await tx.get(identityRef)).data();
  const memberId=identity?.memberId?String(identity.memberId):db.collection(COLLECTIONS.members).doc().id;
  const memberRef=db.collection(COLLECTIONS.members).doc(memberId),member=(await tx.get(memberRef)).data() as MemberDoc|undefined;
  if(identity&&(!member||member.status!=='active'||member.brandId!==brand.brandId||member.companyId!==invite.companyId||member.customerId!==c.customerId||member.normalizedEmail!==invite.email))throw new LoyaltyError('customer_conflict',409);
  if(identity&&identity.brandId!==brand.brandId)throw new LoyaltyError('customer_conflict',409);
  const program=readProgram(brand.brandId,(await tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId))).data());
  const next=discountCardAssignmentSchema.parse({id:assignmentRef.id,brandId:brand.brandId,companyId:invite.companyId,customerId:c.customerId,memberId,groupId:invite.groupId,version:(invite.assignmentVersion??0)+1,status:'active',startsAt:invite.startsAt,expiresAt:invite.endsAt,updatedAt:now});
  const session=randomBytes(32).toString('hex'),expiresAt=now+program.settings.sessionDays*86_400_000;
  if(!c.customer)tx.create(db.collection('customers').doc(c.customerId),{id:c.customerId,brandId:brand.brandId,fullName:invite.name,email:invite.email,normalizedEmail:invite.email,emailAliases:[],phone:'',status:'active',createdAt:new Date(now),totalOrders:0,totalSpend:0,locationIds:[],loyaltyScore:0,loyaltyClassification:'New',marketingConsent:false});
  if(!c.reservation)tx.create(c.identityRef,{brandId:brand.brandId,customerId:c.customerId,emailHash:customerIdentityKey(brand.brandId,invite.email),source:'discount_invitation',createdAt:now,updatedAt:now});
  if(!member)tx.create(memberRef,{companyId:invite.companyId,brandId:brand.brandId,customerId:c.customerId,name:invite.name,normalizedEmail:invite.email,status:'active',joinedAt:now,currentCardId:null,stampDay:null,stampsOnDay:0,termsVersion:DISCOUNT_CARD_TERMS_VERSION,sessionEpoch:0,membershipOrigin:'discount_invitation',consent:{status:'withdrawn',at:now,source:'portal',eventId:''}});
  if(!identity)tx.create(identityRef,{brandId:brand.brandId,memberId,createdAt:now});
  tx.set(assignmentRef,next);
  tx.update(db.collection(INVITATIONS.tokens).doc(id),{usedAt:now});
  tx.update(db.collection(INVITATIONS.outbox).doc(id),{invitationUrl:null,nextAttemptAt:Number.MAX_SAFE_INTEGER});
  tx.create(db.collection(COLLECTIONS.sessions).doc(hashKey('session',session)),{brandId:brand.brandId,memberId,epoch:member?.sessionEpoch??0,createdAt:now,expiresAt,revokedAt:null});
  tx.create(db.collection(C.audit).doc(hashKey('discount-invite-accepted',id)),{brandId:brand.brandId,companyId:invite.companyId,kind:'invitation_accepted',invitationId:id,assignmentId:next.id,assignmentVersion:next.version,memberId,termsVersion:DISCOUNT_CARD_TERMS_VERSION,terms:DISCOUNT_CARD_TERMS,createdAt:now});
  return {session,expiresAt};
 }).catch(e=>{if(e instanceof RateLimited)throw new LoyaltyError('rate_limited',429);throw e;});
}

async function invitationLimit(db:Firestore,scope:string,brand:ProgramBrand,ctx:RequestContext){
 try{await db.runTransaction(async tx=>(await consumeLimit(tx,db,scope,`${brand.brandId}|${ctx.ip}`,30,3_600_000,ctx.now))());}
 catch(e){if(e instanceof RateLimited)throw new LoyaltyError('rate_limited',429);throw e;}
}
