
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const body = JSON.stringify(
    {
      module: 'brand-website',
      paths: [
        '/brands/{brandId}/website/config',
        '/brands/{brandId}/website/home',
        '/brands/{brandId}/website/pages/{slug}',
        '/brands/{brandId}/website/menuSettings',
        '/brands/{brandId}/categories',
        '/brands/{brandId}/menu',
        '/brands/{brandId}/locations/{locationId}',
        '/auditLogs/{autoId}',
        '/dadmin/developer/logs/{autoId}',
      ],
    },
    null,
    2,
  );

  const filename = 'db-paths-dump.json';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
