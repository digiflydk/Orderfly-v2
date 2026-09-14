// src/lib/auth/superadmin-api.ts
import 'server-only';
import { hasPermission } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';

/**
 * Verified central platform authority for global API routes.
 * This should be used at the beginning of GET/POST handlers.
 */
export async function requireSuperadminApi() {
  const isSuperadmin = await hasPermission('users:view');
  if (!isSuperadmin) {
    // Return a standard 403 Forbidden response for API routes
    return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
