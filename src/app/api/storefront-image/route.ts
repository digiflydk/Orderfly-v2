import { getAdminDb } from '@/lib/firebase-admin';
import { mediaCollections, mediaVersion, rasterData } from '@/lib/storefront-media';
import sharp from 'sharp';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const collection = q.get('collection') || '', id = q.get('id') || '', field = q.get('field') || '', version = q.get('v');
  if (!mediaCollections.includes(collection) || !id || id.includes('/') || !/^[\w.]+$/.test(field) || field.split('.').some(p => ['__proto__','constructor','prototype'].includes(p)) || !/^[a-f0-9]{24}$/.test(version || '')) return new Response(null, {status:400});
  if (collection === 'settings' && id !== 'general') return new Response(null, {status:404});
  const snapshot = await getAdminDb().collection(collection).doc(id).get();
  const data = snapshot.data();
  if (!data || data.isActive === false) return new Response(null, {status:404});
  const value = field.split('.').reduce<any>((item, key) => item?.[key], data);
  const match = typeof value === 'string' && value.match(rasterData);
  if (!match || mediaVersion(value) !== version) return new Response(null, {status:404});
  try {
    const result = await sharp(Buffer.from(match[2], 'base64'), {limitInputPixels: 40000000}).rotate().resize({width:960,withoutEnlargement:true}).webp({quality:80}).toBuffer();
    return new Response(new Uint8Array(result), {headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400, s-maxage=604800','X-Content-Type-Options':'nosniff'}});
  } catch { return new Response(null, {status:422}); }
}
