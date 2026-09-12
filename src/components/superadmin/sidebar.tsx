import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { SuperAdminSidebarClient } from "./sidebar-client";
import { getPlatformBrandingSettings } from "@/app/superadmin/settings/queries";

export async function SuperAdminSidebar() {
	const brandingSettings = await getPlatformBrandingSettings();

	return <SuperAdminSidebarClient centralAdmin={mpanelAdminEnabled()} brandingSettings={brandingSettings ?? undefined} />;
}
