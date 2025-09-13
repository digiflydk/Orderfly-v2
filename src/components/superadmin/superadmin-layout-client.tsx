'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import * as S from '@/components/ui/sidebar'

import { SuperAdminSidebarClient } from '@/components/superadmin/sidebar-client'
import { MobileHeader } from './mobile-header'
import { PageLoader } from './page-loader'
import type { PlatformBrandingSettings } from '@/types'

type Props = {
  children: React.ReactNode
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

export function SuperAdminLayoutClient({ children, brandingSettings }: Props) {
  return (
    <S.SidebarProvider>
      <S.Sidebar className="border-r">
        <div className="p-4 text-sm font-medium">
          {brandingSettings?.appName ?? 'Orderfly Studio'}
        </div>
        <SuperAdminSidebarClient brandingSettings={brandingSettings ?? undefined} />
      </S.Sidebar>

      <S.SidebarInset>
        <MobileHeader brandingSettings={brandingSettings ?? undefined} />
        <main className="p-4 md:p-6 lg:p-8">
          <LayoutWithLoader>{children}</LayoutWithLoader>
        </main>
      </S.SidebarInset>
    </S.SidebarProvider>
  )
}
