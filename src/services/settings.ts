
'use server';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { doc, getDoc, setDoc } from '@/lib/server/firestore-compat';
import { db } from '@/lib/server/firestore-compat';
import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache, revalidateTag } from 'next/cache';
import { publicGeneralSettings } from '@/lib/public-general-settings';
import { storefrontMedia } from '@/lib/storefront-media';
import type { GeneralSettings } from '@/types/settings';


const SETTINGS_COLLECTION_ID = 'settings';
const SETTINGS_DOC_ID = 'general';


async function readGeneralSettings(): Promise<GeneralSettings | null> {
    try {
        const docSnap = await getAdminDb().collection(SETTINGS_COLLECTION_ID).doc(SETTINGS_DOC_ID).get();
        if (docSnap.exists) {
            const data = docSnap.data() as GeneralSettings;
            // Backwards compatibility for old header settings
            if (data && 'headerBackgroundColor' in data && !data.headerScrolledBackgroundColor) {
                data.headerScrolledBackgroundColor = (data as any).headerBackgroundColor;
            }
             if (data && 'headerBackgroundOpacity' in data && !data.headerScrolledBackgroundOpacity) {
                data.headerScrolledBackgroundOpacity = (data as any).headerBackgroundOpacity;
            }
            return data;
        }
        return null;
    } catch (error) {
        console.error("SETTINGS_SERVICE_ERROR: Error fetching general settings: ", error);
        throw error;
    }
}
export async function getGeneralSettings(): Promise<GeneralSettings | null> {
  await requirePlatformSuperuser();
  return readGeneralSettings();
}
const cachedSettings = unstable_cache(async () => storefrontMedia(publicGeneralSettings(await readGeneralSettings()), 'settings', 'general'), ['storefront-settings-v2'], {revalidate:60,tags:['storefront']});
export async function getStorefrontSettings() { return cachedSettings(); }


export async function saveGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
  await requirePlatformSuperuser();
    try {
        const settingsDocRef = doc(db, SETTINGS_COLLECTION_ID, SETTINGS_DOC_ID);
        await setDoc(settingsDocRef, settings, { merge: true });
        revalidateTag('storefront');
    } catch (error) {
        console.error("Error saving general settings: ", error);
        throw new Error("Could not save settings.");
    }
}
