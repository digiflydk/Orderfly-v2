import { getAdminDb } from '@/lib/firebase-admin';
import { handleQrRedirect } from '@/lib/qr/redirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Context = { params: Promise<{ code: string }> };
async function handle(request: Request, context: Context) {
  const { code } = await context.params;
  return handleQrRedirect(request, code, { db: getAdminDb, enabled: process.env.QR_MODULE_ENABLED === 'true', environment: process.env.NODE_ENV });
}
export const GET = handle;
export const HEAD = handle;
