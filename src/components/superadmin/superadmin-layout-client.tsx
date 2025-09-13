

'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';
import { SuperAdminSidebar } from '@/app/superadmin/sidebar';
import { MobileHeader } from './mobile-header';
import { PageLoader } from './page-loader';
import type { PlatformBrandingSettings } from '@/types';


function LayoutWithLoader({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    return (
        <div className="relative">
            <Suspense fallback={<PageLoader />}>
                <div key={pathname}>
                     {children}
                </div>
            </Suspense>
        </div>
    );
}

export function SuperAdminLayoutClient({ children, brandingSettings }: { children: React.ReactNode, brandingSettings: PlatformBrandingSettings }) {
  return (
    <div id="admin-theme">
        <SidebarProvider>
        <Sidebar collapsible="icon">
            <SuperAdminSidebar brandingSettings={brandingSettings} />
        </Sidebar>
        <div className="flex flex-col flex-1 bg-background text-foreground">
            <MobileHeader brandingSettings={brandingSettings} />
            <SidebarInset>
            <div className="p-4 md:p-6 lg:p-8 pr-4 md:pr-6 lg:pr-8">
                <LayoutWithLoader>
                    {children}
                </LayoutWithLoader>
            </div>
            </SidebarInset>
        </div>
        </SidebarProvider>
    </div>
  );
}
