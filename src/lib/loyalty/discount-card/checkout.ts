import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { policySchema } from '@/lib/access/policy';
import { customerHasEmail } from '@/lib/customer-identity';
import { COLLECTIONS, hashKey } from '@/lib/loyalty/stamp-card/model';
import { DISCOUNT_CARD_COLLECTIONS as C, discountCardAssignmentId } from './model';
import { discountCardIdSchema, discountCardFeatureSchema, discountCardGroupSchema, discountCardAssignmentSchema, discountCardEligible, discountCardAmountOre, discountCardLocationAllowed } from './rules';

export type DiscountCardEntitlement = {
  brandId: string; locationId: string; customerId: string; memberId: string;
  assignmentId: string; groupId: string; groupName: string; percentage: number;
  featureVersion: number; groupVersion: number; assignmentVersion: number;
};
export type AppliedDiscountCard = DiscountCardEntitlement & {
  eligibleSubtotalOre: number; amountOre: number; purchaseStampsEligible: false;
};
export type DiscountCardCheckoutInput = {
  brandId: string; brandSlug: string; locationId: string; token?: string;
  customerId?: string; email?: string; now: number;
};

/** Public capability only, never group/member data or entitlement. */
export async function discountCardCheckoutEnabled(db:Firestore,brandId:string,locationId:string):Promise<boolean> {
  if (![brandId,locationId].every(id=>discountCardIdSchema.safeParse(id).success)) return false;
  const [f,b,l,p] = await Promise.all([
    db.collection(C.features).doc(brandId).get(),db.collection('brands').doc(brandId).get(),
    db.collection('locations').doc(locationId).get(),db.collection('platformAdminControl').doc('access-v1').get(),
  ]);
  const feature=discountCardFeatureSchema.safeParse(f.data()),policy=policySchema.safeParse(p.data()),brand=b.data(),location=l.data();
  const companies=policy.success?policy.data.companies.filter(c=>c.active&&c.orderflyBrandIds.includes(brandId)):[];
  const company=companies.length===1?companies[0]:null;
  return !!(feature.success&&feature.data.enabled&&feature.data.brandId===brandId&&company&&feature.data.companyId===company.id&&
    brand&&!brand.deletedAt&&!['suspended','inactive','deleted'].includes(brand.status)&&location&&location.brandId===brandId&&location.isActive!==false&&
    discountCardLocationAllowed(feature.data.locationScope,locationId));
}

/** A typed checkout email is never proof. Only a live brand-bound HttpOnly
 * Club session can select an assignment. Optional email/customer bind the order
 * contact to that verified owner. Pass the native transaction when committing. */
export async function readDiscountCardCheckout(db: Firestore, input: DiscountCardCheckoutInput, transaction?: Transaction): Promise<DiscountCardEntitlement | null> {
  if (!input.token || !/^[a-f0-9]{64}$/.test(input.token)) return null;
  if (![input.brandId,input.locationId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/'))) return null;
  const read = async (collection: string, id: string) => {
    const ref = db.collection(collection).doc(id);
    return (transaction ? await transaction.get(ref) : await ref.get()).data();
  };
  const feature = discountCardFeatureSchema.safeParse(await read(C.features,input.brandId));
  if (!feature.success || !feature.data.enabled) return null;
  const [brand, location, policyData, session] = await Promise.all([
    read('brands',input.brandId),read('locations',input.locationId),read('platformAdminControl','access-v1'),
    read(COLLECTIONS.sessions,hashKey('session',input.token)),
  ]);
  const policy = policySchema.safeParse(policyData);
  const companies = policy.success ? policy.data.companies.filter(c => c.active && c.orderflyBrandIds.includes(input.brandId)) : [];
  const company = companies.length === 1 ? companies[0] : null;
  if (!brand || brand.deletedAt || ['suspended','inactive','deleted'].includes(brand.status) || brand.slug !== input.brandSlug || !location || location.brandId !== input.brandId || location.isActive === false ||
      !company || !session || session.brandId !== input.brandId || session.revokedAt || session.expiresAt <= input.now ||
      !Number.isFinite(session.expiresAt) || !discountCardIdSchema.safeParse(session.memberId).success) return null;
  const member = await read(COLLECTIONS.members,session.memberId);
  if (!member || typeof member.normalizedEmail !== 'string' || !member.normalizedEmail.trim() || member.status !== 'active' || member.brandId !== input.brandId || member.companyId !== company.id ||
      member.sessionEpoch !== session.epoch || !discountCardIdSchema.safeParse(member.customerId).success ||
      (input.customerId !== undefined && member.customerId !== input.customerId)) return null;
  const assignmentId = discountCardAssignmentId(input.brandId,member.customerId);
  const [rawAssignment, customer] = await Promise.all([read(C.assignments,assignmentId),read('customers',member.customerId)]);
  const assignment = discountCardAssignmentSchema.safeParse(rawAssignment);
  if (!customer || customer.brandId !== input.brandId || !customerHasEmail(customer,member.normalizedEmail) || ['inactive','deleted'].includes(customer.status) || customer.deletedAt || (input.email !== undefined && !customerHasEmail(customer,input.email)) ||
      !assignment.success || assignment.data.id !== assignmentId || assignment.data.memberId !== session.memberId) return null;
  const group = discountCardGroupSchema.safeParse(await read(C.groups,assignment.data.groupId));
  if (!group.success || !discountCardEligible(feature.data,group.data,assignment.data,{
    brandId:input.brandId,companyId:company.id,customerId:member.customerId,locationId:input.locationId,now:input.now,
  })) return null;
  return {brandId:input.brandId,locationId:input.locationId,customerId:member.customerId,memberId:session.memberId,
    assignmentId,groupId:group.data.id,groupName:group.data.name,percentage:group.data.percentage,
    featureVersion:feature.data.version,groupVersion:group.data.version,assignmentVersion:assignment.data.version};
}

/** Compete, never add: retain an equally good existing offer. Fees are not part
 * of eligibleSubtotalOre. The immutable snapshot belongs to this order only. */
export function discountCardCheckoutSnapshot(entitlement: DiscountCardEntitlement | null, eligibleSubtotalOre: number, competingDiscountOre: number): AppliedDiscountCard | null {
  if (!entitlement) return null;
  const amountOre = discountCardAmountOre(eligibleSubtotalOre,entitlement.percentage);
  if (!Number.isSafeInteger(competingDiscountOre) || competingDiscountOre < 0) throw new Error('invalid_discount_amount');
  return amountOre > competingDiscountOre ? {...entitlement,eligibleSubtotalOre,amountOre,purchaseStampsEligible:false} : null;
}

export async function assertDiscountCardCheckoutCurrent(db: Firestore,input: DiscountCardCheckoutInput,expected: AppliedDiscountCard,transaction?: Transaction) {
  const current = await readDiscountCardCheckout(db,input,transaction);
  if (!current || Object.keys(current).some(key => current[key as keyof DiscountCardEntitlement] !== expected[key as keyof DiscountCardEntitlement])) {
    throw Object.assign(new Error('Dit rabatkort er ændret eller ikke længere gyldigt. Opdatér kassen.'), { code: 'discount_card_changed' });
  }
}
