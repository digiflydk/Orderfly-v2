
// src/app/api/superadmin/docs/api-map/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
import { apiMapsByModule } from '@/lib/docs/api-maps';

export async function GET(req: NextRequest) {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const moduleKey = searchParams.get('module');

  if (moduleKey) {
    const specificMap = apiMapsByModule[moduleKey];
    if (specificMap) {
      return NextResponse.json(specificMap);
    } else {
      return NextResponse.json({ error: `Module '${moduleKey}' not found.` }, { status: 404 });
    }
  }

  // Fallback: list available modules if no specific one is requested
  return NextResponse.json({
    availableModules: Object.keys(apiMapsByModule),
  });
}
