
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Superadmin',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { SuperAdminLayoutClient } from '@/components/superadmin/superadmin-layout-client';
import { getPlatformBrandingSettings } from './settings/queries';
import { hasPermission } from '@/lib/permissions';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import React from 'react';

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const brandingSettings = await getPlatformBrandingSettings();
  
  // This is a basic permission check. In a real app, you'd check a more specific
  // permission like 'superadmin:access_dashboard'.
  const canAccess = hasPermission('users:view'); 

  if (!canAccess) {
    return (
        <SuperAdminLayoutClient brandingSettings={brandingSettings}>
          <AccessDeniedPage />
        </SuperAdminLayoutClient>
    );
  }

  return (
        <SuperAdminLayoutClient brandingSettings={brandingSettings}>{children}</SuperAdminLayoutClient>
  );
}
