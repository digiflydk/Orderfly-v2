import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Discount } from '@/types';

const serialize = (id: string, data: FirebaseFirestore.DocumentData): Discount => ({
  ...data, id,
  startDate: data.startDate?.toDate(), endDate: data.endDate?.toDate(),
  createdAt: data.createdAt?.toDate(), updatedAt: data.updatedAt?.toDate(),
} as Discount);

// Checkout validates eligibility, current tenant/location, customer and price
// before charging. These internal reads grant no administration capability.
export async function getDiscountByCode(code: string, brandId: string): Promise<Discount | null> {
  if (!code || !brandId) return null;
  const result = await getAdminDb().collection('discounts').where('code', '==', code).where('brandId', '==', brandId).limit(2).get();
  if (result.size !== 1) return null;
  const record = result.docs[0], data = record.data();
  if (data.applicationType === 'newsletter_signup') return null;
  return serialize(record.id, data);
}

export async function getDiscountById(id: string): Promise<Discount | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const record = await getAdminDb().collection('discounts').doc(id).get();
  return record.exists ? serialize(record.id, record.data()!) : null;
}
