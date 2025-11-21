
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const dbPaths = [
    "/brands/{brandId}/website/config",
    "/brands/{brandId}/website/home",
    "/brands/{brandId}/website/pages/{slug}",
    "/brands/{brandId}/website/menuSettings",
    "/auditLogs/{logId}",
    "/dadmin/developer/logs/{logId}",
  ];

  const body = JSON.stringify({ paths: dbPaths }, null, 2);
  const filename = "brand-website-db-paths-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
