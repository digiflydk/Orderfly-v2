// src/app/api/superadmin/docs/api-map/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

type ApiEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth: 'public' | 'customer' | 'restaurant' | 'superadmin' | 'debug';
};

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const endpoints: ApiEndpoint[] = [
    // --- Public APIs ---
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
    // --- Superadmin & Docs APIs ---
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
    },
    // --- Diagnostic APIs (require debug token) ---
    {
      method: 'GET',
      path: '/api/diag/health',
      description: 'Performs a health check of the Firebase Admin connection.',
      auth: 'debug',
    },
    {
      method: 'GET',
      path: '/api/diag/brand-location',
      description: 'Probes brand and location data for specified slugs.',
      auth: 'debug',
    },
     {
      method: 'POST',
      path: '/api/diag/brand-location/seed',
      description: 'Seeds a test brand and location for diagnostics.',
      auth: 'debug',
    },
     {
      method: 'GET',
      path: '/api/diag/catalog',
      description: 'Gets product and category counts for a brand.',
      auth: 'debug',
    },
     {
      method: 'POST',
      path: '/api/diag/seed/catalog',
      description: 'Ensures a default category exists and assigns it to products.',
      auth: 'debug',
    },
    {
      method: 'GET',
      path: '/api/diag/imports',
      description: 'Sweeps critical module imports to find build-time errors.',
      auth: 'debug',
    },
     {
      method: 'POST',
      path: '/api/diag/log',
      description: 'Endpoint for client-side logging during debug sessions.',
      auth: 'debug',
    },
    // --- Simple Health Checks (Public) ---
    {
      method: 'GET',
      path: '/api/ok',
      description: 'Simple 200 OK response for load balancer health checks.',
      auth: 'public',
    },
    {
      method: 'GET',
      path: '/api/ping',
      description: 'Simple JSON response with timestamp for health checks.',
      auth: 'public',
    },
    {
      method: 'GET',
      path: '/api/health',
      description: 'Simple JSON response with timestamp for health checks.',
      auth: 'public',
    },
    {
      method: 'GET',
      path: '/api/env',
      description: 'Returns the current Node.js version and M3 preview flag status.',
      auth: 'public',
    },
    {
        method: 'GET',
        path: '/api/debug/diag-logs',
        description: 'Retrieves diagnostic logs from Firestore.',
        auth: 'superadmin'
    },
    {
        method: 'GET',
        path: '/api/debug/feedback',
        description: 'Retrieves the latest 20 feedback entries.',
        auth: 'superadmin'
    },
    {
        method: 'GET',
        path: '/api/docs/bundle',
        description: 'Downloads a bundle of all markdown documentation.',
        auth: 'superadmin'
    },
    {
        method: 'GET',
        path: '/api/docs/download',
        description: 'Downloads a specific documentation file.',
        auth: 'superadmin'
    },
    {
        method: 'GET',
        path: '/api/docs/list',
        description: 'Lists all available documentation files.',
        auth: 'superadmin'
    },
    {
        method: 'GET',
        path: '/api/superadmin/kpis',
        description: 'Retrieves key performance indicators.',
        auth: 'superadmin'
    }
  ];

  return NextResponse.json({ endpoints });
}
