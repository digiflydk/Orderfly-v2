import { collection, getDocs, limit, query, where } from '@/lib/server/firestore-compat';
import {
  normalizeEmail,
  normalizePhone,
} from '@/lib/integrations/esmeralda-customer-contract';
import { selectCustomerByIdentity } from '@/lib/customer-identity';

type CustomerMatch = {
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

  const snapshots = await Promise.all(queries.map(getDocs));
  const matches = new Map<string, CustomerMatch>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      if (matches.has(doc.id)) continue;
      matches.set(doc.id, {
        id: doc.id,
        ref: doc.ref,
        data: { ...doc.data(), id: doc.id },
        doc,
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
