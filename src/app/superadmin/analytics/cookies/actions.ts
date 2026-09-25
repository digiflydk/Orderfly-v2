
'use server';

import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import type { AnonymousCookieConsent, AnalyticsDaily } from '@/types';
import { cookieConsentDateRange } from '@/lib/analytics/cookie-consent-dates';
import * as admin from 'firebase-admin';

export async function getAnonymousCookieConsents(startDate?: Date | string, endDate?: Date | string): Promise<AnonymousCookieConsent[]> {
  await requirePlatformSuperuser();
  if ((startDate === undefined) !== (endDate === undefined)) {
    throw new Error('Vælg både startdato og slutdato.');
  }
  const range = startDate !== undefined && endDate !== undefined
    ? cookieConsentDateRange(startDate, endDate) : null;
  const db = getAdminDb();
  const consentsCollection = db.collection('anonymous_cookie_consents');
  let q: admin.firestore.Query = consentsCollection;

  if (range) {
    const startTimestamp = admin.firestore.Timestamp.fromDate(range.start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(range.end);
    q = q.where('last_seen', '>=', startTimestamp).where('last_seen', '<', endTimestamp).orderBy('last_seen', 'desc');
  } else {
    q = q.orderBy('last_seen', 'desc');
  }
  
  const querySnapshot = await q.get();
  const consents = querySnapshot.docs.map(doc => {
    const data = doc.data();
    const firstSeenDate = data.first_seen ? (data.first_seen as admin.firestore.Timestamp).toDate() : (data.last_seen as admin.firestore.Timestamp).toDate();
    return {
      ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'identityTokenHash')),
      id: doc.id,
      first_seen: firstSeenDate,
      last_seen: (data.last_seen as admin.firestore.Timestamp).toDate(),
    } as AnonymousCookieConsent;
  });
  return consents;
}

// Compatibility export fails closed. Consent writes require the HttpOnly
// browser identity and same-origin checks of the dedicated HTTP endpoint.
export async function saveAnonymousCookieConsent(_data: unknown) {
  return { error: 'Use the consent endpoint.' };
}

export async function getFunnelData(filters: {
  startDate?: Date;
  endDate?: Date;
  brandId?: string;
  locationId?: string;
}): Promise<AnalyticsDaily[]> {
  // Placeholder implementation. In a real app, this would query and aggregate from 'analytics_daily'
  return Promise.resolve([]);
}
