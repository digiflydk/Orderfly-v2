
'use server';

import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { APP_VERSION, COOKIE_LANGUAGE_PATTERN } from '@/lib/cookie-texts';
import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { db } from '@/lib/server/firestore-compat';
import {
	collection,
	deleteField,
	doc,
	getDocs,
	query,
	orderBy,
	Timestamp,
	getDoc,
} from '@/lib/server/firestore-compat';
import type { CookieTexts } from '@/types';
import { redirect } from 'next/navigation';

// Fetch list of cookie text sets (for listing table)
export async function getCookieTexts(): Promise<CookieTexts[]> {
  await requirePlatformSuperuser();
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
  await requirePlatformSuperuser();
  if (!id || /[\/]/.test(id)) return null;
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
  await requirePlatformSuperuser();
	const fieldNames = ['banner_title', 'banner_description', 'accept_all_button', 'customize_button', 'modal_title', 'modal_description', 'save_preferences_button', 'modal_accept_all_button',
    ...['necessary', 'functional', 'statistics', 'marketing'].flatMap(category => [`cat_${category}_title`, `cat_${category}_desc`])];
  const requiredText = z.string().trim().min(1).max(5000);
  const valid = fieldNames.every(name => requiredText.safeParse(formData.get(name)).success);
  const languageResult = z.string().trim().regex(COOKIE_LANGUAGE_PATTERN).safeParse(formData.get('language'));
  if (!valid || !languageResult.success) return { error: 'Complete all text fields and select a valid language.' };
  if (formData.get('consent_version') !== APP_VERSION) return { error: 'This consent version is no longer active. Reload the form and try again.' };
  const normalize = (value: FormDataEntryValue | null): string => typeof value === 'string' ? value.trim() : '';
  const idEntry = formData.get('id');
  const consentVersion = APP_VERSION;
  const language = languageResult.data;
  const brandIdEntry = formData.get('brand_id');
  const bannerTitle = formData.get('banner_title');
  if ((idEntry && (typeof idEntry !== 'string' || !/^[^/]{1,160}$/.test(idEntry))) ||
      (brandIdEntry && (typeof brandIdEntry !== 'string' || !/^[^/]{1,160}$/.test(brandIdEntry)))) return { error: 'Invalid text or brand identifier.' };

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
			: typeof brandIdEntry === 'string' && brandIdEntry.trim()
				? brandIdEntry.trim()
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
				title: normalize(formData.get('cat_statistics_title')),
				description: normalize(formData.get('cat_statistics_desc')),
			},
			statistics: {
				title: normalize(formData.get('cat_statistics_title')),
				description: normalize(formData.get('cat_statistics_desc')),
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

	try {
    const nativeDb = getAdminDb();
    const result = await nativeDb.runTransaction(async transaction => {
      const candidates = await transaction.get(nativeDb.collection('cookie_texts').where('consent_version', '==', APP_VERSION));
      const conflict = candidates.docs.some(candidate => {
        const data = candidate.data();
        return candidate.id !== docId && String(data.language || '').toLowerCase() === language.toLowerCase() &&
          (data.brand_id || '') === (brandId || '');
      });
      if (conflict) return { error: 'Cookie texts already exist for this language and scope. Edit the existing text set instead.' };
      if (brandId && !(await transaction.get(nativeDb.collection('brands').doc(brandId))).exists) return { error: 'The selected brand no longer exists.' };
      transaction.set(nativeDb.collection('cookie_texts').doc(docId), {
        ...dataToSave, brand_id: brandId || deleteField(),
        global_locale_key: brandId ? deleteField() : language.toLowerCase(), last_updated: Timestamp.now(),
      }, { merge: true });
      return null;
    });
    if (result) return result;
  } catch {
    return { error: 'Cookie texts could not be saved. Please try again.' };
  }
  revalidateTag('storefront');
	revalidatePath('/superadmin/settings/cookie-texts');
	redirect('/superadmin/settings/cookie-texts');
}
