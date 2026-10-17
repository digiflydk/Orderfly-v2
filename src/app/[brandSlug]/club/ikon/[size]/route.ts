import { homeScreenBrand, homeScreenIcon, ICON_SIZES } from '../../home-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ brandSlug: string; size: string }> }) {
  const { brandSlug, size } = await params;
  const pixels = Number(size);
  if (!ICON_SIZES.includes(pixels as typeof ICON_SIZES[number])) return new Response('Not found', { status: 404 });
  const brand = await homeScreenBrand(brandSlug);
  if (!brand) return new Response('Not found', { status: 404 });
  const png = await homeScreenIcon(pixels, brand.preset.logoUrl, brand.preset.background);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
}
