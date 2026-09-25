import 'server-only';
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Customer } from '@/types';

export const consentIdentityCookie = 'of_consent_identity';
export const consentSecretHash = (secret: string) => createHash('sha256').update(secret).digest('hex');
export async function readConsentIdentity() {
  const value = (await cookies()).get(consentIdentityCookie)?.value;
  const match = value?.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-f0-9]{64})$/);
  return match ? {id:match[1],secret:match[2]} : null;
}
export function ownsConsent(data: Record<string, any> | undefined, secret: string) {
  const stored = data?.identityTokenHash;
  return typeof stored === 'string' && /^[a-f0-9]{64}$/.test(stored)
    && timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(consentSecretHash(secret),'hex'));
}
export async function linkCheckoutConsent(brandId: string): Promise<Customer['cookie_consent'] | undefined> {
  const identity = await readConsentIdentity();
  if (!identity) return undefined;
  const db = getAdminDb(), ref = db.collection('anonymous_cookie_consents').doc(identity.id);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), data = snapshot.data();
    if (!snapshot.exists || !ownsConsent(data,identity.secret) || data?.brand_id !== brandId) return undefined;
    const timestamp = typeof data.last_seen?.toDate === 'function' ? data.last_seen.toDate() : new Date(data.last_seen);
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) return undefined;
    tx.update(ref,{linked_to_customer:true});
    return {marketing:data.marketing === true,statistics:data.statistics === true,functional:data.functional === true,
      timestamp,consent_version:data.consent_version,linked_anon_id:identity.id,origin_brand:data.origin_brand};
  });
}
