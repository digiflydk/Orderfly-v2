
'use server';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache, revalidateTag } from 'next/cache';
import { storefrontMedia } from '@/lib/storefront-media';
import type { GeneralSettings } from '@/types/settings';


const SETTINGS_COLLECTION_ID = 'settings';
const SETTINGS_DOC_ID = 'general';


export async function getGeneralSettings(): Promise<GeneralSettings | null> {
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
const cachedSettings = unstable_cache(async () => storefrontMedia(await getGeneralSettings(), 'settings', 'general'), ['storefront-settings-v1'], {revalidate:60,tags:['storefront']});
export async function getStorefrontSettings() { return cachedSettings(); }


export async function saveGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
    try {
        const settingsDocRef = doc(db, SETTINGS_COLLECTION_ID, SETTINGS_DOC_ID);
        await setDoc(settingsDocRef, settings, { merge: true });
        revalidateTag('storefront');
    } catch (error) {
        console.error("Error saving general settings: ", error);
        throw new Error("Could not save settings.");
    }
}
