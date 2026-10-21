import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { customerHasEmail, customerIdentityKey } from '@/lib/customer-identity';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { promotionDate } from '@/lib/promotion-date';
import { COLLECTIONS, hashKey, memberIdentityKey, type MemberDoc } from './model';
import { LoyaltyError } from './counter';

export const CLUB_DISCOUNT_CLAIMS = 'loyaltySignupDiscountClaims';
export type ClubDiscountOffer = {
  id: string; discountType: 'percentage' | 'fixed_amount'; discountValue: number;
  description: string; minOrderValue: number; allowStacking: boolean; endsAt: number | null;
  firstTimeCustomerOnly: boolean; locationIds: string[]; orderTypes: string[]; activeDays: string[]; activeTimeSlots: { start: string; end: string }[];
};

// This selects a genuine published promotion, never an amount supplied by the browser.
function offer(id: string, value: Record<string, unknown> | undefined, brandId: string, now: number): ClubDiscountOffer | null {
  if (!value || value.brandId !== brandId || value.applicationType !== 'club_signup' || value.isActive !== true || value.assignedToCustomerId) return null;
  const start = promotionDate(value.startDate), end = promotionDate(value.endDate);
  if ((value.startDate && !start) || (value.endDate && !end) || (start && now < start.getTime()) || (end && now > end.getTime())) return null;
  const idList = (v: unknown): v is string[] => Array.isArray(v) && v.length>0 && v.length<=200 && v.every(x=>typeof x==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x));
  const orderTypes = value.orderTypes;
  if(!idList(value.locationIds) || !Array.isArray(orderTypes) || !orderTypes.length || orderTypes.length>2 || orderTypes.some(x=>!['pickup','delivery'].includes(x)) || new Set(orderTypes).size!==orderTypes.length) return null;
  for(const key of ['minOrderValue','usedCount','usageLimit','perCustomerLimit']) if(value[key]!==undefined && (typeof value[key]!=='number' || !Number.isFinite(value[key]) || Number(value[key])<0 || (key!=='minOrderValue' && !Number.isSafeInteger(value[key])))) return null;
  for(const key of ['allowStacking','firstTimeCustomerOnly']) if(value[key]!==undefined && typeof value[key]!=='boolean') return null;
  if(value.activeDays!==undefined && (!Array.isArray(value.activeDays) || value.activeDays.some(x=>!['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(x)))) return null;
  if(value.activeTimeSlots!==undefined && (!Array.isArray(value.activeTimeSlots) || value.activeTimeSlots.length>24 || value.activeTimeSlots.some(x=>!x || typeof x.start!=='string' || typeof x.end!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end) || x.start>=x.end))) return null;
  if(start && end && start>end) return null;
  const amount = value.discountValue;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !['percentage', 'fixed_amount'].includes(String(value.discountType)) || (value.discountType === 'percentage' && amount > 100)) return null;
  if (!Array.isArray(value.locationIds) || !value.locationIds.length || !Array.isArray(value.orderTypes) || !value.orderTypes.length) return null;
  if (Number(value.usageLimit) > 0 && Number(value.usedCount || 0) >= Number(value.usageLimit)) return null;
  return { id, discountType: value.discountType as ClubDiscountOffer['discountType'], discountValue: amount,
    description: typeof value.description === 'string' ? value.description : '', minOrderValue: Math.max(0, Number(value.minOrderValue) || 0),
    allowStacking: value.allowStacking === true, endsAt: end?.getTime() ?? null,
    firstTimeCustomerOnly: value.firstTimeCustomerOnly === true, locationIds: value.locationIds.filter((v): v is string => typeof v === 'string'), orderTypes: value.orderTypes.filter((v): v is string => typeof v === 'string'),
    activeDays: Array.isArray(value.activeDays) ? value.activeDays.filter((v): v is string => typeof v === 'string') : [],
    activeTimeSlots: Array.isArray(value.activeTimeSlots) ? value.activeTimeSlots.filter((v): v is {start:string;end:string} => !!v && typeof v.start === 'string' && typeof v.end === 'string') : [] };
}

export async function selectClubDiscount(db: Firestore, brandId: string, now: number, discountId?: string, tx?: Transaction): Promise<ClubDiscountOffer | null> {
  if (discountId) {
    const ref = db.collection('discounts').doc(discountId);
    const snap = tx ? await tx.get(ref) : await ref.get();
    return offer(snap.id, snap.data(), brandId, now);
  }
  const query = db.collection('discounts').where('brandId', '==', brandId);
  const rows = tx ? await tx.get(query) : await query.get();
  // Stable choice for standalone registration; checkout may supply its already-priced valid offer.
  return rows.docs.sort((a,b) => a.id.localeCompare(b.id)).map(doc => offer(doc.id, doc.data(), brandId, now)).find(Boolean) ?? null;
}

function claimRefs(db: Firestore, brandId: string, email: string, customerId: string) {
  return [db.collection(CLUB_DISCOUNT_CLAIMS).doc(hashKey('club-discount-email', brandId, normalizeEmail(email))),
    db.collection(CLUB_DISCOUNT_CLAIMS).doc(hashKey('club-discount-customer', brandId, customerId))];
}

// All reads happen here. Call apply only after every other transaction stage has read.
export async function stageClubSignupDiscount({db,tx,brandId,email,customerId,customer,discountId,now}: {
  db: Firestore; tx: Transaction; brandId: string; email: string; customerId: string;
  customer: Record<string, unknown> | null; discountId?: string; now: number;
}) {
  const selected = await selectClubDiscount(db, brandId, now, discountId, tx);
  const refs = claimRefs(db,brandId,email,customerId), claims = await Promise.all(refs.map(ref=>tx.get(ref)));
  if (!selected || (selected.firstTimeCustomerOnly && Number(customer?.totalOrders || 0)>0) || claims.some(s=>s.exists) || customer?.pendingClubDiscountId) return {offer:null,apply:()=>{}};
  const usage = customer?.discountUsage as Record<string,number> | undefined;
  if ((usage?.[selected.id] || 0) > 0) return {offer:null,apply:()=>{}};
  return {offer:selected,apply:()=>{
    tx.update(db.collection('customers').doc(customerId), {pendingClubDiscountId:selected.id});
    for (const ref of refs) tx.create(ref, {brandId,customerId,discountId:selected.id,createdAt:now});
  }};
}

async function customerForEmail(db: Firestore, brandId: string, email: string) {
  const reservation = (await db.collection('integrationConsumerCustomerIdentities').doc(customerIdentityKey(brandId,email)).get()).data();
  if (reservation) {
    const snap = typeof reservation.customerId === 'string' ? await db.collection('customers').doc(reservation.customerId).get() : null;
    if (reservation.brandId !== brandId || !snap?.exists || snap.data()?.brandId !== brandId || !customerHasEmail(snap.data()!,email)) throw new LoyaltyError('customer_conflict',409);
    return {id:snap.id,data:snap.data()!};
  }
  const collection = db.collection('customers');
  const queries = await Promise.all([collection.where('brandId','==',brandId).where('normalizedEmail','==',email).limit(2).get(),
    collection.where('brandId','==',brandId).where('email','==',email).limit(2).get(),
    collection.where('brandId','==',brandId).where('emailAliases','array-contains',email).limit(2).get()]);
  const matches = [...new Map(queries.flatMap(q=>q.docs).map(s=>[s.id,s])).values()];
  if (matches.length>1) throw new LoyaltyError('customer_conflict',409);
  return matches.length ? {id:matches[0].id,data:matches[0].data()} : null;
}

export async function getClubSignupDiscountEligibility({db,brandId,email,discountId,now}: {
  db: Firestore; brandId: string; email: string; discountId: string; now: number;
}): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const selected = normalized ? await selectClubDiscount(db,brandId,now,discountId) : null;
  if (!selected) return false;
  const identity = (await db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brandId,normalized)).get()).data();
  const customer = await customerForEmail(db,brandId,normalized);
  if (customer && (Number(customer.data.discountUsage?.[discountId] || 0)>0 || (selected.firstTimeCustomerOnly && Number(customer.data.totalOrders || 0)>0))) return false;
  if (identity) {
    const member = (await db.collection(COLLECTIONS.members).doc(String(identity.memberId)).get()).data() as MemberDoc | undefined;
    return !!member && member.status==='active' && member.brandId===brandId && customer?.id===member.customerId && customer.data.pendingClubDiscountId===discountId;
  }
  const emailClaim = await db.collection(CLUB_DISCOUNT_CLAIMS).doc(hashKey('club-discount-email',brandId,normalized)).get();
  if (emailClaim.exists) return false;
  if (customer && (await claimRefs(db,brandId,normalized,customer.id)[1].get()).exists) return false;
  return true;
}
