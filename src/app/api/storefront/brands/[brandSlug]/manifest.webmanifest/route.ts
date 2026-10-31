import { loadStorefrontHomeScreen } from '@/lib/server/storefront-home-screen';
import { storefrontInstallManifest } from '@/lib/storefront-home-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ brandSlug: string }> }) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const brand = await loadStorefrontHomeScreen((await params).brandSlug, host);
  // The same URL has different start/scope on an apex path and brand host.
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!brand) return new Response('Not found', { status: 404, headers });
  return Response.json(storefrontInstallManifest(brand, host), {
    headers: { ...headers, 'Content-Type': 'application/manifest+json' },
  });
}
