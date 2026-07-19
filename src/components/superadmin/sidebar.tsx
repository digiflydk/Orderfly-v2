import { SuperAdminSidebarClient } from "./sidebar-client";
import { getPlatformBrandingSettings } from "@/app/superadmin/settings/queries";

export async function SuperAdminSidebar() {
  const brandingSettings = await getPlatformBrandingSettings();

  return <SuperAdminSidebarClient brandingSettings={brandingSettings ?? undefined} />;
}
