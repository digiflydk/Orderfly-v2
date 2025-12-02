
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import type { CookieTexts } from '@/types';
import { redirect } from 'next/navigation';

// Fetch list of cookie text sets (for listing table)
export async function getCookieTexts(): Promise<CookieTexts[]> {
  const q = query(
    collection(db, 'cookie_texts'),
    orderBy('consent_version', 'desc'),
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...(data as Omit<CookieTexts, 'id' | 'last_updated'>),
      id: d.id,
      last_updated: (data.last_updated as Timestamp).toDate(),
    } as CookieTexts;
  });
}

// Fetch single cookie text set by id (for edit page)
export async function getCookieTextById(id: string): Promise<CookieTexts | null> {
  const ref = doc(db, 'cookie_texts', id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();

  return {
    ...(data as Omit<CookieTexts, 'id' | 'last_updated'>),
    id: snap.id,
    last_updated: (data.last_updated as Timestamp).toDate(),
  } as CookieTexts;
}

type CookieTextsFormResult =
  | { error: string }
  | { success: true };

// Create or update cookie texts from the form
export async function createOrUpdateCookieTexts(
  formData: FormData,
): Promise<CookieTextsFormResult | void> {
  // Helper to normalize form values to string
  const normalize = (value: FormDataEntryValue | null): string =>
    typeof value === 'string' ? value : '';

  const idEntry = formData.get('id');
  const consentVersion = formData.get('consent_version');
  const language = formData.get('language');
  const brandIdEntry = formData.get('brand_id');
  const bannerTitle = formData.get('banner_title');

  // Basic validation
  if (!consentVersion || !language || !bannerTitle) {
    return { error: 'Required fields are missing.' };
  }

  const existingId =
    typeof idEntry === 'string' && idEntry.trim().length > 0
      ? idEntry.trim()
      : undefined;

  // Ensure docId is always a string
  const docId =
    existingId ??
    doc(collection(db, 'cookie_texts')).id;

  const brandId =
    brandIdEntry === 'global'
      ? undefined
      : typeof brandIdEntry === 'string'
        ? brandIdEntry
        : undefined;

  const dataToSave: Omit<CookieTexts, 'id' | 'last_updated'> = {
    consent_version: normalize(consentVersion),
    language: normalize(language),
    brand_id: brandId,
    shared_scope: 'orderfly',
    banner_title: normalize(bannerTitle),
    banner_description: normalize(formData.get('banner_description')),
    accept_all_button: normalize(formData.get('accept_all_button')),
    customize_button: normalize(formData.get('customize_button')),
    modal_title: normalize(formData.get('modal_title')),
    modal_description: normalize(formData.get('modal_description')),
    save_preferences_button: normalize(formData.get('save_preferences_button')),
    modal_accept_all_button: normalize(formData.get('modal_accept_all_button')),
    categories: {
      necessary: {
        title: normalize(formData.get('cat_necessary_title')),
        description: normalize(formData.get('cat_necessary_desc')),
      },
      functional: {
        title: normalize(formData.get('cat_functional_title')),
        description: normalize(formData.get('cat_functional_desc')),
      },
      analytics: {
        title: normalize(formData.get('cat_analytics_title')),
        description: normalize(formData.get('cat_analytics_desc')),
      },
      statistics: {
        title: normalize(formData.get('cat_statistics_title')),
        description: normalize(formData.get('cat_statistics_desc')),
      },
      performance: {
        title: normalize(formData.get('cat_performance_title')),
        description: normalize(formData.get('cat_performance_desc')),
      },
      marketing: {
        title: normalize(formData.get('cat_marketing_title')),
        description: normalize(formData.get('cat_marketing_desc')),
      },
    },
  };

  // Remove brand_id entirely if not set, to use global scope
  if (dataToSave.brand_id === undefined) {
    delete (dataToSave as any).brand_id;
  }

  await setDoc(
    doc(db, 'cookie_texts', docId),
    {
      ...dataToSave,
      last_updated: Timestamp.now(),
    },
    { merge: true },
  );

  revalidatePath('/superadmin/settings/cookie-texts');
  redirect('/superadmin/settings/cookie-texts');
}
