import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = { title: 'Superadmin • Orderfly' };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { SuperAdminLayoutClient } from '@/components/superadmin/superadmin-layout-client';
import { getPlatformBrandingSettings } from './settings/queries';
import { hasPermission } from '@/lib/permissions';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

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

  // Simpelt permission-tjek (kan udbygges senere)
  const canAccess = hasPermission('users:view');

  if (!canAccess) {
    return (
      <SuperAdminLayoutClient brandingSettings={brandingSettings}>
        <AccessDeniedPage />
      </SuperAdminLayoutClient>
    );
  }

  return (
    <SuperAdminLayoutClient brandingSettings={brandingSettings}>
      {children}
    </SuperAdminLayoutClient>
  );
}
