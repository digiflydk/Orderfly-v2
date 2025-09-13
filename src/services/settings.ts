
'use server';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GeneralSettings } from '@/types/settings';


const SETTINGS_COLLECTION_ID = 'settings';
const SETTINGS_DOC_ID = 'general';


export async function getGeneralSettings(): Promise<GeneralSettings | null> {
    try {
        const settingsDocRef = doc(db, SETTINGS_COLLECTION_ID, SETTINGS_DOC_ID);
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
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
        return null; // Return null on error to allow build to continue
    }
}


export async function saveGeneralSettings(settings: Partial<GeneralSettings>): Promise<void> {
    try {
        const settingsDocRef = doc(db, SETTINGS_COLLECTION_ID, SETTINGS_DOC_ID);
        await setDoc(settingsDocRef, settings, { merge: true });
    } catch (error) {
        console.error("Error saving general settings: ", error);
        throw new Error("Could not save settings.");
    }
}
