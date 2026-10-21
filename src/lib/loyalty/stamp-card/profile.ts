import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { customerHasEmail, customerHasPhone, customerIdentityKey } from '@/lib/customer-identity';
import { normalizeCustomerPhone } from '@/lib/customer-phone';
import { LoyaltyError } from './counter';
import { copenhagenDay, COLLECTIONS, type MemberDoc } from './model';
import type { MemberSession, ProgramBrand, RequestContext } from './membership';
import { profileFromCustomer, profileSchema, type ProfileInput } from './profile-rules';

// Update the central customer, never a second copy on loyaltyMembers. Recheck the
// session inside the transaction so logout/deletion cannot race a profile write.
export async function updateMemberProfile(db: Firestore, brand: ProgramBrand, session: MemberSession, input: ProfileInput, ctx: RequestContext) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success || (parsed.data.birthDate && parsed.data.birthDate > copenhagenDay(ctx.now))) throw new LoyaltyError('invalid_request', 400);
  const values = parsed.data;
  return db.runTransaction(async tx => {
    const memberRef = db.collection(COLLECTIONS.members).doc(session.memberId);
    const [memberSnap, sessionSnap] = await Promise.all([
      tx.get(memberRef), tx.get(db.collection(COLLECTIONS.sessions).doc(session.sessionId)),
    ]);
    const member = memberSnap.data() as MemberDoc | undefined, currentSession = sessionSnap.data();
    if (!member || member.status !== 'active' || member.brandId !== brand.brandId || !currentSession
      || currentSession.memberId !== session.memberId || currentSession.brandId !== brand.brandId
      || currentSession.revokedAt || currentSession.expiresAt <= ctx.now || currentSession.epoch !== member.sessionEpoch) throw new LoyaltyError('unauthorized', 401);
    const customerRef = db.collection('customers').doc(member.customerId), customerSnap = await tx.get(customerRef), customer = customerSnap.data();
    if (!customer || customer.brandId !== brand.brandId || !customerHasEmail(customer, member.normalizedEmail)) throw new LoyaltyError('customer_conflict', 409);
    const next = { ...profileFromCustomer(customer, ctx.now), ...values };
    const phone = normalizeCustomerPhone(next.phone);
    const phoneRef = phone ? db.collection('integrationConsumerCustomerPhoneIdentities').doc(customerIdentityKey(brand.brandId, phone)) : null;
    let phoneKnown = false;
    if (values.phone !== undefined && phone && phoneRef) {
      // Legacy customers may have only a formatted primary phone and no index.
      // A normalized equality query cannot prove uniqueness for those rows.
      const [identity, customers] = await Promise.all([
        tx.get(phoneRef), tx.get(db.collection('customers').where('brandId', '==', brand.brandId)),
      ]);
      const owner = identity.data(); phoneKnown = identity.exists;
      if ((owner && (owner.brandId !== brand.brandId || owner.customerId !== member.customerId))
        || customers.docs.some(doc => doc.id !== member.customerId && customerHasPhone(doc.data(), phone))) throw new LoyaltyError('customer_conflict', 409);
    }
    const changes: Record<string, unknown> = { updatedAt: new Date(ctx.now) };
    if (values.birthDate !== undefined) changes.birthDate = next.birthDate;
    if (values.gender !== undefined) changes.gender = next.gender;
    if (values.phone !== undefined) {
      // Retain historical aliases/reservations for the shared customer matcher.
      // They are not displayed as the customer's current phone number.
      const oldPhones = [customer.phone, customer.normalizedPhone].map(value => normalizeCustomerPhone(typeof value === 'string' ? value : ''));
      const aliases = Array.isArray(customer.phoneAliases) ? customer.phoneAliases.filter((value): value is string => typeof value === 'string') : [];
      changes.phone = next.phone; changes.normalizedPhone = phone;
      changes.phoneAliases = [...new Set([...aliases.map(normalizeCustomerPhone), ...oldPhones].filter((value): value is string => !!value && value !== phone))];
      if (phoneRef && phone) tx.set(phoneRef, { brandId: brand.brandId, customerId: member.customerId, phoneHash: customerIdentityKey(brand.brandId, phone),
        source: 'loyalty_profile', updatedAt: ctx.now, ...(phoneKnown ? {} : { createdAt: ctx.now }) }, { merge: true });
    }
    tx.update(customerRef, changes);
    return { profile: next };
  });
}
