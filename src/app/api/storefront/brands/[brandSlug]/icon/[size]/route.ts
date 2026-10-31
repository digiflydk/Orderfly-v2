import { loadStorefrontHomeScreen } from '@/lib/server/storefront-home-screen';
import { homeScreenIcon, ICON_SIZES } from '@/lib/server/home-screen-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ brandSlug: string; size: string }> }) {
  const { brandSlug, size } = await params;
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!ICON_SIZES.some(allowed => String(allowed) === size)) return new Response('Not found', { status: 404, headers });
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const brand = await loadStorefrontHomeScreen(brandSlug, host);
  if (!brand) return new Response('Not found', { status: 404, headers });
  const png = await homeScreenIcon(Number(size), brand.logoUrl, brand.background);
  return new Response(new Uint8Array(png), { headers: { ...headers, 'Content-Type': 'image/png' } });
}
