// src/app/api/superadmin/docs/db-paths/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

type DbPath = {
  key: string;
  pathTemplate: string;
  description: string;
};

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const paths: DbPath[] = [
    {
      key: 'brandDocument',
      pathTemplate: 'brands/{brandId}',
      description: 'Brand level configuration and metadata.',
    },
    {
      key: 'locationDocument',
      pathTemplate: 'locations/{locationId}',
      description: 'Global location settings, linked back to a brand.',
    },
    {
        key: 'productCollection',
        pathTemplate: 'products',
        description: 'Global collection of all products for all brands.',
    },
    {
      key: 'orderCollection',
      pathTemplate: 'orders',
      description: 'Global collection of all customer orders.',
    },
  ];

  return NextResponse.json({ paths });
}
