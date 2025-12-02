

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, Timestamp, getDoc } from 'firebase/firestore';
import type { CookieTexts } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

export async function getCookieTexts(): Promise<CookieTexts[]> {
  const q = query(collection(db, 'cookie_texts'), orderBy('consent_version', 'desc'));
  const querySnapshot = await getDocs(q);
  const texts = querySnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      last_updated: (data.last_updated as Timestamp).toDate(),
    } as CookieTexts;
  });
  return texts;
}

export async function getCookieTextById(id: string): Promise<CookieTexts | null> {
    const docRef = doc(db, 'cookie_texts', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        return null;
    }
    const data = docSnap.data();
    return { 
        id: docSnap.id, 
        ...data,
        last_updated: (data.last_updated as Timestamp).toDate(),
    } as CookieTexts;
}


export async function createOrUpdateCookieTexts(formData: FormData) {
    const rawData = {
        id: formData.get('id') || undefined,
        consent_version: formData.get('consent_version'),
        language: formData.get('language'),
        brand_id: formData.get('brand_id') === 'global' ? undefined : formData.get('brand_id'),
        banner_title: formData.get('banner_title'),
        banner_description: formData.get('banner_description'),
        accept_all_button: formData.get('accept_all_button'),
        customize_button: formData.get('customize_button'),
        modal_title: formData.get('modal_title'),
        modal_description: formData.get('modal_description'),
        save_preferences_button: formData.get('save_preferences_button'),
        modal_accept_all_button: formData.get('modal_accept_all_button'),
        categories: {
            necessary: { title: formData.get('cat_necessary_title'), description: formData.get('cat_necessary_desc') },
            functional: { title: formData.get('cat_functional_title'), description: formData.get('cat_functional_desc') },
            analytics: { title: formData.get('cat_analytics_title'), description: formData.get('cat_analytics_desc') },
            performance: { title: formData.get('cat_performance_title'), description: formData.get('cat_performance_desc') },
            marketing: { title: formData.get('cat_marketing_title'), description: formData.get('cat_marketing_desc') },
            statistics: { title: formData.get('cat_statistics_title'), description: formData.get('cat_statistics_desc') },
        }
    }

    // Basic validation, should be expanded with Zod
    if (!rawData.consent_version || !rawData.language || !rawData.banner_title) {
        return { error: 'Required fields are missing.' };
    }
    
    const docId = rawData.id || doc(collection(db, 'cookie_texts')).id;
    
    const dataToSave: Omit<CookieTexts, 'id' | 'last_updated'> & {last_updated: Timestamp} = {
        consent_version: rawData.consent_version as string,
        language: rawData.language as string,
        brand_id: rawData.brand_id as string | undefined,
        shared_scope: "orderfly",
        banner_title: rawData.banner_title as string,
        banner_description: rawData.banner_description as string,
        accept_all_button: rawData.accept_all_button as string,
        customize_button: rawData.customize_button as string,
        modal_title: rawData.modal_title as string,
        modal_description: rawData.modal_description as string,
        save_preferences_button: rawData.save_preferences_button as string,
        modal_accept_all_button: rawData.modal_accept_all_button as string,
        categories: {
          necessary: {
            title: rawData.categories.necessary.title as string,
            description: rawData.categories.necessary.description as string,
          },
          functional: {
            title: rawData.categories.functional.title as string,
            description: rawData.categories.functional.description as string,
          },
          analytics: {
            title: rawData.categories.analytics.title as string,
            description: rawData.categories.analytics.description as string,
          },
          statistics: {
            title: rawData.categories.statistics.title as string,
            description: rawData.categories.statistics.description as string,
          },
          performance: {
            title: rawData.categories.performance.title as string,
            description: rawData.categories.performance.description as string,
          },
          marketing: {
            title: rawData.categories.marketing.title as string,
            description: rawData.categories.marketing.description as string,
          },
        },
    };
    
    // Explicitly remove brand_id if it's undefined to avoid sending `undefined` to Firestore
    if (dataToSave.brand_id === undefined) {
        delete dataToSave.brand_id;
    }

    await setDoc(doc(db, 'cookie_texts', docId), { ...dataToSave, last_updated: Timestamp.now() }, { merge: true });

    revalidatePath('/superadmin/settings/cookie-texts');
    redirect('/superadmin/settings/cookie-texts');
}
