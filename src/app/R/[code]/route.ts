import { GET as redirect } from '@/app/q/[code]/route';
import { qrSlugFromScanCode } from '@/lib/qr/scan-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Context = { params: Promise<{ code: string }> };
async function handle(request: Request, context: Context) {
  const { code } = await context.params;
  // Delegate to the existing endpoint so origin, status, tenant, rate limit,
  // metrics and Club attribution all keep using the original stored slug.
  return redirect(request, { params: Promise.resolve({ code: qrSlugFromScanCode(code) ?? '' }) });
}
export const GET = handle;
export const HEAD = handle;
