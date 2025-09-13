'use server'

import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import type { PlatformBrandingSettings } from '@/types'

export async function getPlatformBrandingSettings(): Promise<PlatformBrandingSettings | null> {
  try {
    const docRef = doc(db, 'platform_settings', 'branding')
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      console.warn('⚠️ No branding settings found in Firestore.')
      return null
    }

    const raw = docSnap.data()

    return {
      platformLogoUrl: raw?.platformLogoUrl ?? null,
      platformFaviconUrl: raw?.platformFaviconUrl ?? null,
      platformHeading:
        typeof raw?.platformHeading === 'string' && raw.platformHeading.trim()
          ? raw.platformHeading.trim()
          : 'OrderFly',
    }
  } catch (err) {
    console.error('🔥 Error fetching branding settings:', err)
    return null
  }
}
