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
    // Public APIs
    {
      method: 'POST',
      path: '/api/analytics/collect',
      description: 'Collects a client-side analytics event.',
      auth: 'public',
    },
    {
      method: 'POST',
      path: '/api/consent/save-anonymous',
      description: 'Saves cookie consent choices for an anonymous user.',
      auth: 'public',
    },
    {
      method: 'GET',
      path: '/api/orders/lookup-by-session',
      description: 'Looks up an order ID using a Stripe session ID.',
      auth: 'public',
    },
    {
      method: 'POST',
      path: '/api/payments/confirm-from-session',
      description: 'Confirms payment status for an order from a Stripe session.',
      auth: 'public',
    },
    {
      method: 'POST',
      path: '/api/stripe/webhook',
      description: 'Handles incoming webhooks from Stripe to update order status.',
      auth: 'public',
    },
    // Superadmin & Debug APIs
    {
      method: 'GET',
      path: '/api/debug/all',
      description: 'Retrieves a comprehensive debug snapshot of the system.',
      auth: 'superadmin',
    },
    {
      method: 'GET',
      path: '/api/debug/snapshot',
      description: 'Downloads the debug snapshot as a JSON file.',
      auth: 'superadmin',
    },
    {
      method: 'GET',
      path: '/api/docs',
      description: 'Renders the Swagger UI for API documentation.',
      auth: 'superadmin',
    },
     {
      method: 'GET',
      path: '/api/redoc',
      description: 'Renders the ReDoc UI for API documentation.',
      auth: 'superadmin',
    },
    {
      method: 'GET',
      path: '/openapi.json',
      description: 'Serves the OpenAPI specification file.',
      auth: 'superadmin',
    }
  ];

  return NextResponse.json({ endpoints });
}
