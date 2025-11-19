// src/app/api/superadmin/docs/api-map/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

type ApiEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth: 'public' | 'customer' | 'restaurant' | 'superadmin';
};

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const endpoints: ApiEndpoint[] = [
    {
      method: 'POST',
      path: '/api/public/order',
      description: 'Create a new customer order from the webshop.',
      auth: 'public',
    },
    {
      method: 'GET',
      path: '/api/restaurant/orders',
      description: 'List current orders for a restaurant location.',
      auth: 'restaurant',
    },
    {
      method: 'GET',
      path: '/api/superadmin/brands',
      description: 'List brands available in superadmin.',
      auth: 'superadmin',
    },
    // Add the most important endpoints here
  ];

  return NextResponse.json({ endpoints });
}
