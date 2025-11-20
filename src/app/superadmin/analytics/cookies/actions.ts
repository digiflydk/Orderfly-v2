
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { AnonymousCookieConsent, AnalyticsDaily } from '@/types';
import { z } from 'zod';
import { startOfDay, endOfDay } from 'date-fns';
import * as admin from 'firebase-admin';

export async function getAnonymousCookieConsents(startDate?: Date, endDate?: Date): Promise<AnonymousCookieConsent[]> {
  const db = getAdminDb();
  const consentsCollection = db.collection('anonymous_cookie_consents');
  let q: admin.firestore.Query = consentsCollection;

  if (startDate && endDate) {
    const startTimestamp = admin.firestore.Timestamp.fromDate(startOfDay(startDate));
    const endTimestamp = admin.firestore.Timestamp.fromDate(endOfDay(endDate));
    q = q.where('last_seen', '>=', startTimestamp).where('last_seen', '<=', endTimestamp).orderBy('last_seen', 'desc');
  } else {
    q = q.orderBy('last_seen', 'desc');
  }
  
  const querySnapshot = await q.get();
  const consents = querySnapshot.docs.map(doc => {
    const data = doc.data();
    const firstSeenDate = data.first_seen ? (data.first_seen as admin.firestore.Timestamp).toDate() : (data.last_seen as admin.firestore.Timestamp).toDate();
    return {
      ...data,
      id: doc.id,
      first_seen: firstSeenDate,
      last_seen: (data.last_seen as admin.firestore.Timestamp).toDate(),
    } as AnonymousCookieConsent;
  });
  return consents;
}

const consentSchema = z.object({
  anon_user_id: z.string().uuid(),
  marketing: z.boolean(),
  statistics: z.boolean(),
  functional: z.boolean(),
  necessary: z.literal(true),
  consent_version: z.string(),
  origin_brand: z.string(),
  brand_id: z.string(),
  shared_scope: z.literal('orderfly'),
});


export async function saveAnonymousCookieConsent(data: Omit<AnonymousCookieConsent, 'id' | 'first_seen' | 'last_seen' | 'linked_to_customer'>) {
    try {
        const db = getAdminDb();
        const validatedData = consentSchema.safeParse(data);
        if(!validatedData.success) {
            console.error('Invalid cookie consent data:', validatedData.error.flatten());
            return { error: 'Invalid data format.' };
        }

        const docRef = db.collection('anonymous_cookie_consents').doc(validatedData.data.anon_user_id);
        
        const docSnap = await docRef.get();

        const consentDataToSave: any = {
            ...validatedData.data,
            last_seen: admin.firestore.Timestamp.now(),
            linked_to_customer: docSnap.exists ? docSnap.data()!.linked_to_customer : false, 
        };

        if (!docSnap.exists) {
            consentDataToSave.first_seen = admin.firestore.Timestamp.now();
            consentDataToSave.origin_brand = validatedData.data.origin_brand;
        } else {
             consentDataToSave.origin_brand = docSnap.data()!.origin_brand || validatedData.data.origin_brand;
        }
        
        await docRef.set(consentDataToSave, { merge: true });
        
        return { success: true };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error saving consent';
        console.error("Failed to save anonymous cookie consent:", e);
        return { error: errorMessage };
    }
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
