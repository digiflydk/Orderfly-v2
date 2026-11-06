import { getPublicCookieTexts } from '@/lib/server/public-cookie-texts';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return Response.json(await getPublicCookieTexts(params.get('brandId') || '', params.get('language') || 'da'));
}
