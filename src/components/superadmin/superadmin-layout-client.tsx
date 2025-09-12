'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

// KORREKTE alias-stier (brug "@/")
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';
import { SuperAdminSidebar } from '@/components/superadmin/sidebar-client';
import { MobileHeader } from './mobile-header';
import { PageLoader } from './page-loader';
import type { PlatformBrandingSettings } from '@/types';

type Props = {
  children: React.ReactNode;
  brandingSettings: PlatformBrandingSettings | null;
};

function LayoutWithLoader({ children }: Props) {
  const pathname = usePathname();
  return (
    <div className="relative">
      <Suspense fallback={<PageLoader />}>
        <div key={pathname}>{children}</div>
      </Suspense>
    </div>
  );
}

export function SuperAdminLayoutClient({ children, brandingSettings }: Props) {
  return (
    <SidebarProvider>
      <Sidebar className="border-r">
        {/* Logo / branding i venstre sidebar (meget simpelt) */}
        <div className="p-4 text-sm font-medium">
          {brandingSettings?.appName ?? 'Orderfly Studio'}
        </div>
        <SuperAdminSidebar />
      </Sidebar>

      <SidebarInset>
        <MobileHeader brandingSettings={brandingSettings} />
        <main className="p-4">
          <LayoutWithLoader brandingSettings={brandingSettings}>
            {children}
          </LayoutWithLoader>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
