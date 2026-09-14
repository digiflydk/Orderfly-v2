import { orderflySession } from '@/lib/access/orderfly-session';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { SuperAdminSidebarClient } from "./sidebar-client";
import { getPlatformBrandingSettings } from "@/app/superadmin/settings/queries";

export async function SuperAdminSidebar() {
	const brandingSettings = await getPlatformBrandingSettings();

	const access = await orderflySession().catch(() => null);
	return <SuperAdminSidebarClient access={access} centralAdmin={mpanelAdminEnabled()} brandingSettings={brandingSettings ?? undefined} />;
}
