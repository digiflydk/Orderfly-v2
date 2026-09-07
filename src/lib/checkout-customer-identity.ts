import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

export async function findCheckoutCustomer(brandId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const matches = await getAdminDb().collection('customers').where('brandId', '==', brandId)
    .where('normalizedEmail', '==', normalizedEmail).limit(2).get();
  if (matches.size > 1) throw new Error('Multiple customer records match this email. Contact support.');
  return matches.empty ? null : matches.docs[0];
}
