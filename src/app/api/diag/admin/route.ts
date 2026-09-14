import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  return new Response(null, { status: 204 });
}
export async function POST() {
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  return new Response(null, { status: 204 });
}
