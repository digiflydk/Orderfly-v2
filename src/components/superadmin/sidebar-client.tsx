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
import type { PlatformBrandingSettings } from '@/types'
import {
  Home,
  ShoppingCart,
  Users,
  Building2,
  Package,
  MapPin,
  Tags,
  Gift,
  ShieldCheck,
  Percent,
  ClipboardList,
  SquareStack,
  Layers,
  Utensils,
  MessageSquare,
  Trophy,
  BarChart3,
  CreditCard,
  Bookmark,
  Globe,
  Settings,
  Code2,
  LayoutTemplate,
} from 'lucide-react'

export function SuperAdminSidebarClient({
  brandingSettings,
}: {
  brandingSettings?: PlatformBrandingSettings
}) {
  const pathname = usePathname()
  const logoUrl = brandingSettings?.platformLogoUrl

  const groups: {
    title: string
    items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
  }[] = [
    {
      title: 'Core',
      items: [{ href: '/superadmin', label: 'Dashboard', icon: Home }],
    },
    {
      title: 'Commerce',
      items: [
        { href: '/superadmin/sales/orders', label: 'Sales & Orders', icon: ShoppingCart },
        { href: '/superadmin/customers', label: 'Customers', icon: Users },
      ],
    },
    {
      title: 'Catalog',
      items: [
        { href: '/superadmin/brands', label: 'Brands', icon: Building2 },
        { href: '/superadmin/products', label: 'Products', icon: Package },
        { href: '/superadmin/locations', label: 'Locations', icon: MapPin },
        { href: '/superadmin/categories', label: 'Categories', icon: SquareStack },
        { href: '/superadmin/food-categories', label: 'Food Categories', icon: Utensils },
        { href: '/superadmin/toppings', label: 'Toppings', icon: Layers },
        { href: '/superadmin/upsells', label: 'Upsells', icon: Bookmark },
        { href: '/superadmin/allergens', label: 'Allergens', icon: ShieldCheck },
      ],
    },
    {
      title: 'Promotions',
      items: [
        { href: '/superadmin/discounts', label: 'Discounts', icon: Tags },
        { href: '/superadmin/combos', label: 'Combos', icon: Gift },
        { href: '/superadmin/offers-combos-validation', label: 'Offers/Combos Validation', icon: ClipboardList },
        { href: '/superadmin/discount-validation', label: 'Discount Validation', icon: Percent },
        { href: '/superadmin/standard-discounts', label: 'Standard Discounts', icon: Percent },
        { href: '/superadmin/loyalty', label: 'Loyalty', icon: Trophy },
      ],
    },
    {
      title: 'People & Access',
      items: [
        { href: '/superadmin/roles', label: 'Roles', icon: ShieldCheck },
        { href: '/superadmin/users', label: 'Users', icon: Users },
      ],
    },
    {
      title: 'Quality',
      items: [
        { href: '/superadmin/ui-validation', label: 'UI Validation', icon: LayoutTemplate },
        { href: '/superadmin/feedback', label: 'Feedback', icon: MessageSquare },
      ],
    },
    {
      title: 'Insights',
      items: [{ href: '/superadmin/analytics', label: 'Analytics', icon: BarChart3 }],
    },
    {
      title: 'Billing',
      items: [
        { href: '/superadmin/billing', label: 'Billing', icon: CreditCard },
        { href: '/superadmin/subscriptions', label: 'Subscriptions', icon: Bookmark },
      ],
    },
    {
      title: 'Website',
      items: [
        { href: '/superadmin/website', label: 'Website', icon: Globe },
        { href: '/superadmin/website/pages/header', label: 'Header', icon: LayoutTemplate },
        { href: '/superadmin/website/pages/footer', label: 'Footer', icon: LayoutTemplate },
      ],
    },
    {
      title: 'System',
      items: [
        { href: '/superadmin/settings', label: 'Settings', icon: Settings },
        { href: '/superadmin/code-review', label: 'Code Review', icon: Code2 },
      ],
    },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarTrigger />
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden px-3 py-4">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="OrderFly Logo"
                width={120}
                height={40}
                className="object-contain"
              />
            ) : (
              <span className="text-sm font-medium">OrderFly</span>
            )}
          </div>
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2',
                            pathname === item.href ? 'text-primary font-medium' : 'text-muted-foreground'
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
          ))}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
