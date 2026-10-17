import { homeScreenBrand, manifest } from '../home-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ brandSlug: string }> }) {
  const brand = await homeScreenBrand((await params).brandSlug);
  if (!brand) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(manifest(brand.name, brand.base, brand.preset.background)), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
  });
}
