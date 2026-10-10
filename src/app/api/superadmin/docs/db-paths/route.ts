import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
export async function GET() {
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  return NextResponse.json({ error: 'Developer documentation exports are retired.' }, { status: 410 });
}
