import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { policySchema } from '@/lib/access/policy';
import { customerHasEmail } from '@/lib/customer-identity';
import type { MemberSession, ProgramBrand } from '@/lib/loyalty/stamp-card/membership';
import { COLLECTIONS } from '@/lib/loyalty/stamp-card/model';
import { DISCOUNT_CARD_COLLECTIONS as C, discountCardAssignmentId } from './model';
import { discountCardAssignmentSchema, discountCardFeatureSchema, discountCardGroupSchema, discountCardIdSchema } from './rules';

export type PortalDiscountCard = {
  groupName: string; percentage: number;
  status: 'active' | 'pending' | 'blocked' | 'inactive' | 'upcoming' | 'expired';
  startsAt: number | null; expiresAt: number | null;
  locations: { all: boolean; names: string[] };
  showStampCard: boolean;
};

/** Owner-only informational view. It never issues or authorizes a discount. */
export async function memberDiscountCard(db: Firestore, brand: ProgramBrand, session: MemberSession, now: number): Promise<PortalDiscountCard | null> {
  if (!Number.isFinite(now) || !discountCardIdSchema.safeParse(brand.brandId).success || !discountCardIdSchema.safeParse(session.memberId).success) return null;
  return db.runTransaction(async tx => {
    const [memberSnap, sessionSnap, featureSnap, policySnap, brandSnap] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.members).doc(session.memberId)),
      tx.get(db.collection(COLLECTIONS.sessions).doc(session.sessionId)),
      tx.get(db.collection(C.features).doc(brand.brandId)),
      tx.get(db.collection('platformAdminControl').doc('access-v1')),
      tx.get(db.collection('brands').doc(brand.brandId)),
    ]);
    const member = memberSnap.data(), currentSession = sessionSnap.data();
    const policy = policySchema.safeParse(policySnap.data()), feature = discountCardFeatureSchema.safeParse(featureSnap.data());
    if (!member || member.status !== 'active' || member.brandId !== brand.brandId || !currentSession
      || currentSession.memberId !== session.memberId || currentSession.brandId !== brand.brandId
      || currentSession.revokedAt || !(currentSession.expiresAt > now) || currentSession.epoch !== member.sessionEpoch
      || !discountCardIdSchema.safeParse(member.customerId).success || !policy.success || !feature.success
      || !brandSnap.exists || brandSnap.data()?.status === 'suspended') return null;
    const company = policy.data.companies.find(c => c.active && c.orderflyBrandIds.includes(brand.brandId));
    if (!company || company.id !== brand.companyId || member.companyId !== company.id || feature.data.companyId !== company.id || feature.data.brandId !== brand.brandId) return null;
    const assignmentId = discountCardAssignmentId(brand.brandId, member.customerId);
    const [assignmentSnap, customerSnap] = await Promise.all([
      tx.get(db.collection(C.assignments).doc(assignmentId)), tx.get(db.collection('customers').doc(member.customerId)),
    ]);
    const assignment = discountCardAssignmentSchema.safeParse(assignmentSnap.data()), customer = customerSnap.data();
    if (!assignment.success || assignment.data.id !== assignmentId || assignment.data.brandId !== brand.brandId
      || assignment.data.companyId !== company.id || assignment.data.customerId !== member.customerId
      || assignment.data.memberId !== session.memberId || !customer || customer.brandId !== brand.brandId
      || !customerHasEmail(customer, member.normalizedEmail)) return null;
    const a = assignment.data;
    const group = discountCardGroupSchema.safeParse((await tx.get(db.collection(C.groups).doc(a.groupId))).data());
    if (!group.success || group.data.id !== a.groupId || group.data.brandId !== brand.brandId || group.data.companyId !== company.id) return null;
    const scope = feature.data.locationScope;
    const names: string[] = [];
    if (scope.mode === 'selected') {
      const locations = await Promise.all(scope.locationIds.map(id => tx.get(db.collection('locations').doc(id))));
      for (const location of locations) {
        const data = location.data();
        if (!data || data.brandId !== brand.brandId || !company.locationIds.includes(location.id)) return null;
        names.push(typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 160) : 'Lokation uden navn');
      }
    }
    const status = a.status === 'blocked' ? 'blocked' : a.status === 'pending' ? 'pending'
      : !feature.data.enabled || !group.data.active ? 'inactive'
      : a.expiresAt !== null && a.expiresAt <= now ? 'expired'
      : a.startsAt !== null && a.startsAt > now ? 'upcoming' : 'active';
    return { groupName: group.data.name, percentage: group.data.percentage, status, startsAt: a.startsAt, expiresAt: a.expiresAt,
      locations: { all: scope.mode === 'all', names }, showStampCard: member.membershipOrigin !== 'discount_invitation' || !!member.currentCardId };
  });
}
