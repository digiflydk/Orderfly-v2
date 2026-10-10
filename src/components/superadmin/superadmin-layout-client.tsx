
'use client'

import { Suspense } from 'react'
import type { NavigationAccess } from '@/lib/access/navigation'
import { usePathname } from 'next/navigation'
import * as S from '@/components/ui/sidebar'

import { SuperAdminSidebarClient } from '@/components/superadmin/sidebar-client'
import { MobileHeader } from './mobile-header'
import { PageLoader } from './page-loader'
import type { PlatformBrandingSettings } from '@/types'

type Props = {
  children: React.ReactNode
  access?: NavigationAccess | null
  centralAdmin?: boolean
  brandingSettings?: PlatformBrandingSettings | null
  merchantPortal?: boolean
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

export function SuperAdminLayoutClient({ children, brandingSettings, centralAdmin, access, merchantPortal = false }: Props) {
  return (
    <S.SidebarProvider className="admin-shell">
      <SuperAdminSidebarClient access={access} centralAdmin={centralAdmin} merchantPortal={merchantPortal}
        brandingSettings={
          brandingSettings ?? {}
        }
      />

      <S.SidebarInset className="bg-background">
        <MobileHeader
          homeHref={merchantPortal ? '/merchant' : '/superadmin'}
          brandingSettings={
            brandingSettings ?? {}
          }
        />
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
          <LayoutWithLoader>{children}</LayoutWithLoader>
        </main>
      </S.SidebarInset>
    </S.SidebarProvider>
  )
}
