
'use client'

import { Suspense } from 'react'
import type { NavigationAccess } from '@/lib/access/navigation'
import { usePathname } from 'next/navigation'
import * as S from '@/components/ui/sidebar'

import { SuperAdminSidebarClient } from '@/components/superadmin/sidebar-client'
import { MobileHeader } from './mobile-header'
import { LogoutButton } from './logout-button'
import { PageLoader } from './page-loader'
import type { PlatformBrandingSettings } from '@/types'

type Props = {
  children: React.ReactNode
  access?: NavigationAccess | null
  centralAdmin?: boolean
  brandingSettings?: PlatformBrandingSettings | null
}

function LayoutWithLoader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="relative">
      <Suspense fallback={<PageLoader />}>
        <div key={pathname}>{children}</div>
      </Suspense>
    </div>
  )
}

export function SuperAdminLayoutClient({ children, brandingSettings, centralAdmin, access }: Props) {
  return (
    <S.SidebarProvider className="admin-shell">
      <S.Sidebar collapsible="icon" className="border-r">
        <SuperAdminSidebarClient access={access} centralAdmin={centralAdmin}
          brandingSettings={
            brandingSettings ?? { platformHeading: 'Orderfly Studio' }
          }
        />
      </S.Sidebar>

      <S.SidebarInset className="bg-background">
        {access&&<LogoutButton/>}
        <MobileHeader
          brandingSettings={
            brandingSettings ?? { platformHeading: 'Orderfly Studio' }
          }
        />
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
          <LayoutWithLoader>{children}</LayoutWithLoader>
        </main>
      </S.SidebarInset>
    </S.SidebarProvider>
  )
}
