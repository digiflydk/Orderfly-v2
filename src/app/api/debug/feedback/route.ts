import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
import { NextResponse } from 'next/server';
export async function GET() {
  const denied = await requireSuperadminApi();
  if (denied) return denied; return NextResponse.json({ error: 'Not found' }, { status: 404 }); }
