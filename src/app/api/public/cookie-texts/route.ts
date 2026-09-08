import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache } from 'next/cache';
import { APP_VERSION, defaultTexts, mergeCookieTexts } from '@/lib/cookie-texts';
export const runtime = 'nodejs';
const read = unstable_cache(async (brandId: string, language: string) => {
  const snapshot = await getAdminDb().collection('cookie_texts').where('consent_version', '==', APP_VERSION).where('language', '==', language).get();
  const rows = snapshot.docs.map(doc => doc.data());
  return mergeCookieTexts(rows.find(row => row.brand_id === brandId) || rows.find(row => !row.brand_id) || {});
}, ['public-cookie-texts-v1'], {revalidate: 60, tags: ['storefront']});
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, brand = params.get('brandId') || '', language = params.get('language') || 'en';
  if (!/^[^/\?#]{1,160}$/.test(brand) || !/^[a-z]{2,3}$/i.test(language)) return Response.json(defaultTexts);
  try { return Response.json(await read(brand, language)); }
  catch { return Response.json(defaultTexts); }
}
