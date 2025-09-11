

import { SuperAdminSidebarClient } from "@/components/superadmin/sidebar-client";
import { PlatformBrandingSettings } from "@/types";

// This is now a simple wrapper that receives props from the layout.
export function SuperAdminSidebar({ brandingSettings }: { brandingSettings: PlatformBrandingSettings }) {
  return <SuperAdminSidebarClient brandingSettings={brandingSettings} />;
}
