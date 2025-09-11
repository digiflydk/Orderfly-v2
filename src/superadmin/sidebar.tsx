import { SuperAdminSidebarClient } from "./sidebar-client";
import { getPlatformBrandingSettings } from "@/app/superadmin/settings/actions";

export async function SuperAdminSidebar() {
  const brandingSettings = await getPlatformBrandingSettings();

  return <SuperAdminSidebarClient brandingSettings={brandingSettings} />;
}
