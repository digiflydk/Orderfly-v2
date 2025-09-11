

'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { PlatformBrandingSettings } from '@/types';


export async function getPlatformBrandingSettings(): Promise<PlatformBrandingSettings> {
  const docRef = doc(db, 'platform_settings', 'branding');
  const docSnap = await getDoc(docRef);
  const raw = docSnap.exists() ? docSnap.data() : {};

  return {
    platformLogoUrl: raw?.platformLogoUrl ?? null,
    platformFaviconUrl: raw?.platformFaviconUrl ?? null,
    platformHeading:
      (typeof raw?.platformHeading === 'string' && raw.platformHeading.trim()) || 'OrderFly',
  };
}
