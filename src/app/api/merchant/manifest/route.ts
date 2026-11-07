import { merchantInstallBrand, merchantManifestIcons } from '@/lib/server/merchant-home-screen';
import { storefrontInstallManifest } from '@/lib/storefront-home-screen';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const brand = await merchantInstallBrand(host);
  const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/manifest+json', 'X-Content-Type-Options': 'nosniff' };
  if (!brand) return new Response('Not found', { status: 404, headers });
  const manifest = storefrontInstallManifest(brand, host);
  return Response.json({ ...manifest, icons: merchantManifestIcons(brand.slug, manifest.icons), id: '/merchant', start_url: '/kasse', scope: '/' }, { headers });
}
