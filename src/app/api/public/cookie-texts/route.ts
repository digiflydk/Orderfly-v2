import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache } from 'next/cache';
import { APP_VERSION, COOKIE_LANGUAGE_PATTERN, getDefaultCookieTexts, mergeCookieTexts } from '@/lib/cookie-texts';
export const runtime = 'nodejs';

// Legacy records use mixed-case locale codes and omit brand_id for global scope.
// Query only exact/base locales, retaining those records without a data migration.
function localeVariants(language: string) {
  const variants = (value: string): string[] => [...value].reduce<string[]>((out, char) =>
    [...new Set(out.flatMap(prefix => [prefix + char.toLowerCase(), prefix + char.toUpperCase()]))], ['']);
  return [...new Set([...variants(language), ...variants(language.split('-')[0])])];
}
function localizedQuery(language: string) {
  return getAdminDb().collection('cookie_texts').where('language', 'in', localeVariants(language));
}
// Firestore cannot query absent brand_id fields. Share this legacy global lookup
// across all brands for a locale, rather than repeating it per storefront.
const readGlobal = unstable_cache(async (language: string) => {
  const snapshot = await localizedQuery(language).get();
  return snapshot.docs.map(doc => doc.data()).filter(row => !row.brand_id && row.consent_version === APP_VERSION);
}, ['public-global-cookie-texts-v3'], { revalidate: 60, tags: ['storefront'] });
const read = unstable_cache(async (brandId: string, language: string) => {
  const locale = language.toLowerCase(), base = locale.split('-')[0];
  const snapshot = await getAdminDb().collection('cookie_texts').where('brand_id', '==', brandId).get();
  const rows = snapshot.docs.map(doc => doc.data()).filter(row => row.brand_id === brandId && row.consent_version === APP_VERSION);
  const matching = (items: typeof rows, lang: string) => items.find(row => String(row.language || '').toLowerCase() === lang);
  const own = matching(rows, locale) || matching(rows, base);
  if (own) return mergeCookieTexts(own, language);
  const global = await readGlobal(language);
  return mergeCookieTexts(matching(global, locale) || matching(global, base) || {}, language);
}, ['public-cookie-texts-v3'], {revalidate: 60, tags: ['storefront']});
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, brand = params.get('brandId') || '', language = (params.get('language') || 'da').toLowerCase();
  if (!/^[^/\?#]{1,160}$/.test(brand) || !COOKIE_LANGUAGE_PATTERN.test(language)) return Response.json(getDefaultCookieTexts(language));
  try { return Response.json(await read(brand, language)); }
  catch { return Response.json(getDefaultCookieTexts(language)); }
}
