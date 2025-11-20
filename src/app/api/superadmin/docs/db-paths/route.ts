
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
      key: 'brandCollection',
      pathTemplate: 'brands',
      description: 'Top-level collection for all brands.',
    },
    {
      key: 'brandDocument',
      pathTemplate: 'brands/{brandId}',
      description: 'Brand level configuration and metadata.',
    },
    {
      key: 'locationCollection',
      pathTemplate: 'locations',
      description: 'Top-level collection for all locations.',
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
    {
      key: 'customerCollection',
      pathTemplate: 'customers',
      description: 'Collection of unique customers across all brands.',
    },
    {
      key: 'feedbackCollection',
      pathTemplate: 'feedback',
      description: 'Collection of all customer feedback entries.',
    },
    {
      key: 'settingsDocument',
      pathTemplate: 'platform_settings/{settingId}',
      description: 'A document containing a specific global setting (e.g., "analytics", "payment_gateway").',
    },
    {
      key: 'cookieTextsCollection',
      pathTemplate: 'cookie_texts',
      description: 'Stores versioned and localized texts for the cookie consent UI.',
    },
    {
      key: 'rolesCollection',
      pathTemplate: 'roles',
      description: 'Global user roles and permissions.',
    },
    {
      key: 'usersCollection',
      pathTemplate: 'users',
      description: 'Global collection of admin and brand users.',
    },
  ];

  return NextResponse.json({ paths });
}
