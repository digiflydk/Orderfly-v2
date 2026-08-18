import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-no-store';

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? null;

  return NextResponse.json({
    ok: Boolean(projectId),
    firebase: {
      projectId,
      authDomain,
    },
    timestamp: new Date().toISOString(),
  });
}
