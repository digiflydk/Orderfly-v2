import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache } from 'next/cache';
import { APP_VERSION, COOKIE_LANGUAGE_PATTERN, getDefaultCookieTexts, mergeCookieTexts } from '@/lib/cookie-texts';
export const runtime = 'nodejs';
const read = unstable_cache(async (brandId: string, language: string) => {
  const locale = language.toLowerCase(), base = locale.split('-')[0];
  const snapshot = await getAdminDb().collection('cookie_texts').where('consent_version', '==', APP_VERSION).get();
  const rows = snapshot.docs.map(doc => doc.data());
  const matching = (scope: string, lang: string) => rows.find(row => (row.brand_id || '') === scope && String(row.language || '').toLowerCase() === lang);
  const selected = matching(brandId, locale) || matching(brandId, base) || matching('', locale) || matching('', base);
  return mergeCookieTexts(selected || {}, language);
}, ['public-cookie-texts-v2'], {revalidate: 60, tags: ['storefront']});
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, brand = params.get('brandId') || '', language = params.get('language') || 'da';
  if (!/^[^/\?#]{1,160}$/.test(brand) || !COOKIE_LANGUAGE_PATTERN.test(language)) return Response.json(getDefaultCookieTexts(language));
  try { return Response.json(await read(brand, language)); }
  catch { return Response.json(getDefaultCookieTexts(language)); }
}
