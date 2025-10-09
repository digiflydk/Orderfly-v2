'use client'

import { SuperAdminSidebarClient } from '@/components/superadmin/sidebar-client'
import type { PlatformBrandingSettings } from '@/types'

export function SuperAdminSidebar({
  brandingSettings,
}: {
  brandingSettings?: PlatformBrandingSettings
}) {
  return <SuperAdminSidebarClient brandingSettings={brandingSettings} />
}

export default function Sidebar(props: { brandingSettings?: PlatformBrandingSettings }) {
  return <SuperAdminSidebarClient brandingSettings={props?.brandingSettings} />
}
