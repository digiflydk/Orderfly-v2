import { collection, doc, getDoc, getDocs, limit, query, where } from '@/lib/server/firestore-compat';
import {
  normalizeEmail,
  normalizePhone,
} from '@/lib/integrations/esmeralda-customer-contract';
import {
  customerHasEmail,
  customerHasPhone,
  customerIdentityKey,
  selectCustomerByIdentity,
  type CustomerIdentityFields,
} from '@/lib/customer-identity';

type CustomerMatch = CustomerIdentityFields & {
  id: string;
  ref: { id: string };
  data: Record<string, unknown>;
  doc: any;
};

export async function findCheckoutCustomer(
  brandId: string,
  email: string,
  phone?: string | null,
) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const customerCollection = collection({ path: '' }, 'customers');
  const queries = [
    query(customerCollection, where('brandId', '==', brandId), where('normalizedEmail', '==', normalizedEmail), limit(2)),
    query(customerCollection, where('brandId', '==', brandId), where('email', '==', normalizedEmail), limit(2)),
    query(customerCollection, where('brandId', '==', brandId), where('emailAliases', 'array-contains', normalizedEmail), limit(2)),
  ];
  if (normalizedPhone) {
    queries.push(
      query(customerCollection, where('brandId', '==', brandId), where('normalizedPhone', '==', normalizedPhone), limit(2)),
      query(customerCollection, where('brandId', '==', brandId), where('phoneAliases', 'array-contains', normalizedPhone), limit(2)),
    );
    if (typeof phone === 'string' && phone.trim() && phone.trim() !== normalizedPhone) {
      queries.push(
        query(customerCollection, where('brandId', '==', brandId), where('phone', '==', phone.trim()), limit(2)),
      );
    }
  }

  const emailHash = customerIdentityKey(brandId, normalizedEmail);
  const phoneHash = normalizedPhone
    ? customerIdentityKey(brandId, normalizedPhone)
    : null;
  const identityRefs = [
    getDoc(doc({ path: '' }, 'integrationConsumerCustomerIdentities', emailHash)),
    ...(phoneHash ? [
      getDoc(doc({ path: '' }, 'integrationConsumerCustomerPhoneIdentities', phoneHash)),
    ] : []),
  ];
  const [snapshots, identitySnapshots] = await Promise.all([
    Promise.all(queries.map(getDocs)),
    Promise.all(identityRefs),
  ]);
  const matches = new Map<string, CustomerMatch>();
  for (const snapshot of snapshots) {
    for (const customerDoc of snapshot.docs) {
      if (matches.has(customerDoc.id)) continue;
      const data = customerDoc.data() as Record<string, unknown>;
      matches.set(customerDoc.id, {
        ...data,
        id: customerDoc.id,
        ref: customerDoc.ref,
        data: { ...data, id: customerDoc.id },
        doc: customerDoc,
      });
    }
  }

  for (let index = 0; index < identitySnapshots.length; index++) {
    const identitySnapshot = identitySnapshots[index];
    if (!identitySnapshot.exists()) continue;
    const expectedIdentity = index === 0 ? 'email' : 'phone';
    const indexedBrandId = identitySnapshot.data()?.brandId;
    const indexedCustomerId = identitySnapshot.data()?.customerId;
    if (indexedBrandId !== brandId || typeof indexedCustomerId !== 'string' || !indexedCustomerId)
      throw new Error('Customer identity scope conflict.');
    const customerDoc = await getDoc(doc({ path: '' }, 'customers', indexedCustomerId));
    if (!customerDoc.exists())
      throw new Error('Customer identity scope conflict.');
    const data = { ...customerDoc.data(), id: customerDoc.id } as Record<string, unknown>;
    if (data.brandId !== brandId
      || (expectedIdentity === 'email' && !customerHasEmail(data, normalizedEmail))
      || (expectedIdentity === 'phone' && !customerHasPhone(data, normalizedPhone))) {
      throw new Error('Customer identity scope conflict.');
    }
    if (!matches.has(customerDoc.id)) {
      matches.set(customerDoc.id, {
        ...data,
        id: customerDoc.id,
        ref: customerDoc.ref,
        data,
        doc: customerDoc,
      });
    }
  }

  const selected = selectCustomerByIdentity(
    [...matches.values()],
    normalizedEmail,
    normalizedPhone,
    customer => customer.id,
  );
  return selected?.doc || null;
}
