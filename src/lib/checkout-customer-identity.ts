import { db } from '@/lib/server/firestore-compat';
import { collection, query, where, limit, getDocs } from '@/lib/server/firestore-compat';

export async function findCheckoutCustomer(brandId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const matches = await getDocs(query(collection(db, 'customers'), where('brandId', '==', brandId), where('normalizedEmail', '==', normalizedEmail), limit(2)));
  if (matches.size > 1) throw new Error('Multiple customer records match this email. Contact support.');
  return matches.empty ? null : matches.docs[0];
}
