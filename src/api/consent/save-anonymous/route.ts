
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import type { AnonymousCookieConsent } from '@/types';

// Zod schema for input validation
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

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const validatedData = consentSchema.safeParse(data);

    if (!validatedData.success) {
      console.error('Invalid cookie consent data:', validatedData.error.flatten());
      return NextResponse.json({ error: 'Invalid data format.' }, { status: 400 });
    }

    const docRef = doc(db, 'anonymous_cookie_consents', validatedData.data.anon_user_id);
    const docSnap = await getDoc(docRef);

    const consentDataToSave: any = {
      ...validatedData.data,
      last_seen: Timestamp.now(),
      linked_to_customer: docSnap.exists() ? docSnap.data().linked_to_customer : false,
    };

    if (!docSnap.exists()) {
      consentDataToSave.first_seen = Timestamp.now();
      consentDataToSave.origin_brand = validatedData.data.origin_brand;
    } else {
      // Ensure origin_brand is not overwritten if it already exists
      consentDataToSave.origin_brand = docSnap.data().origin_brand || validatedData.data.origin_brand;
    }

    await setDoc(docRef, consentDataToSave, { merge: true });

    return NextResponse.json({ success: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error saving consent';
    console.error("Failed to save anonymous cookie consent via API:", e);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
