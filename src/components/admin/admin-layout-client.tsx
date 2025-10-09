
'use client';

import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
} from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/sidebar';

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <AdminSidebar />
      </Sidebar>
      <SidebarInset className="bg-background text-foreground">
        <div className="min-h-screen p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
