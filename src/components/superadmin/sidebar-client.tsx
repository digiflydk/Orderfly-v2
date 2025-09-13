'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { PlatformBrandingSettings } from '@/types'
import {
  Home,
  LayoutTemplate,
  Settings,
  MapPin,
  Building2,
} from 'lucide-react'

export function SuperAdminSidebarClient({
  brandingSettings,
}: {
  brandingSettings?: PlatformBrandingSettings
}) {
  const pathname = usePathname()

  const menuItems = [
    { href: '/superadmin', label: 'Dashboard', icon: Home },
    {
      href: '/superadmin/website/pages/header',
      label: 'Header',
      icon: LayoutTemplate,
    },
    {
      href: '/superadmin/website/pages/footer',
      label: 'Footer',
      icon: LayoutTemplate,
    },
    { href: '/superadmin/brands', label: 'Brands', icon: Building2 },
    { href: '/superadmin/locations', label: 'Locations', icon: MapPin },
    { href: '/superadmin/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarTrigger />
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden px-3 py-4">
            {brandingSettings?.platformLogoUrl ? (
              <Image
                src={brandingSettings.platformLogoUrl}
                alt="OrderFly Logo"
                width={120}
                height={40}
                style={{ height: 'auto', width: 'auto' }}
              />
            ) : (
              <span className="text-sm font-medium">OrderFly</span>
            )}
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2',
                        pathname === item.href
                          ? 'text-primary font-medium'
                          : 'text-muted-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
