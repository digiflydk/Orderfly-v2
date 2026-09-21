import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';

import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = { title: 'Superadmin • Orderfly' };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { SuperAdminLayoutClient } from '@/components/superadmin/superadmin-layout-client';
import { getPlatformBrandingSettings } from './settings/queries';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { redirect } from 'next/navigation';

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hent branding – fail-sikkert
  let brandingSettings: Awaited<ReturnType<typeof getPlatformBrandingSettings>> | null = null;
  try {
    brandingSettings = await getPlatformBrandingSettings();
  } catch {
    brandingSettings = null;
  }

  const session = await orderflySession().catch(() => null);
  if(!session)redirect('/admin-login');
  const canAccess = session?.superuser || session?.permissions.some(p => p.startsWith('orderfly.'));

  if (!canAccess) {
    return (
      <SuperAdminLayoutClient access={session} centralAdmin={mpanelAdminEnabled()} brandingSettings={brandingSettings}>
        <AccessDeniedPage />
      </SuperAdminLayoutClient>
    );
  }

  return (
    <SuperAdminLayoutClient access={session} centralAdmin={mpanelAdminEnabled()} brandingSettings={brandingSettings}>
      {children}
    </SuperAdminLayoutClient>
  );
}
