// src/lib/auth/superadmin.ts
import 'server-only';
import { hasPermission } from '@/lib/auth/permissions';
import { redirect } from 'next/navigation';

/** Server pages for global platform administration. */
export async function requireSuperadmin() {
  if (!await hasPermission('users:view')) redirect('/admin-login');
}
