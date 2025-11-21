
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const dbPaths = {
    "module": "brand-website",
    "paths": [
      "/brands/{brandId}/website",
      "/brands/{brandId}/website/config",
      "/brands/{brandId}/website/home",
      "/brands/{brandId}/website/pages",
      "/brands/{brandId}/website/pages/{slug}",
      "/brands/{brandId}/website/menuSettings"
    ]
  };

  const body = JSON.stringify(dbPaths, null, 2);
  const filename = "db-paths-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
