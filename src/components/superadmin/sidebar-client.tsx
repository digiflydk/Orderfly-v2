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
  ChevronDown,
} from 'lucide-react'

export function SuperAdminSidebarClient({
  brandingSettings,
}: {
  brandingSettings?: PlatformBrandingSettings
}) {
  const pathname = usePathname()

  const logoUrl =
    brandingSettings?.platformLogoUrl ||
    'https://i.postimg.cc/HxTMqLGV/Orderfly-Logo-white-F.png'

  const groups: {
    key: string
    title: string
    items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
  }[] = [
    { key: 'core', title: 'Core', items: [{ href: '/superadmin', label: 'Dashboard', icon: Home }] },
    {
      key: 'commerce',
      title: 'Commerce',
      items: [
        { href: '/superadmin/sales/orders', label: 'Sales & Orders', icon: ShoppingCart },
        { href: '/superadmin/customers', label: 'Customers', icon: Users },
      ],
    },
    {
      key: 'catalog',
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
      key: 'promotions',
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
      key: 'people',
      title: 'People & Access',
      items: [
        { href: '/superadmin/roles', label: 'Roles', icon: ShieldCheck },
        { href: '/superadmin/users', label: 'Users', icon: Users },
      ],
    },
    {
      key: 'quality',
      title: 'Quality',
      items: [
        { href: '/superadmin/ui-validation', label: 'UI Validation', icon: LayoutTemplate },
        { href: '/superadmin/feedback', label: 'Feedback', icon: MessageSquare },
      ],
    },
    { key: 'insights', title: 'Insights', items: [{ href: '/superadmin/analytics', label: 'Analytics', icon: BarChart3 }] },
    {
      key: 'billing',
      title: 'Billing',
      items: [
        { href: '/superadmin/billing', label: 'Billing', icon: CreditCard },
        { href: '/superadmin/subscriptions', label: 'Subscriptions', icon: Bookmark },
      ],
    },
    {
      key: 'website',
      title: 'Website',
      items: [
        { href: '/superadmin/website', label: 'Website', icon: Globe },
        { href: '/superadmin/website/pages/header', label: 'Header', icon: LayoutTemplate },
        { href: '/superadmin/website/pages/footer', label: 'Footer', icon: LayoutTemplate },
      ],
    },
    {
      key: 'system',
      title: 'System',
      items: [
        { href: '/superadmin/settings', label: 'Settings', icon: Settings },
        { href: '/superadmin/code-review', label: 'Code Review', icon: Code2 },
      ],
    },
  ]

  const [open, setOpen] = React.useState<Record<string, boolean>>({
    core: true,
    commerce: true,
    catalog: true,
    promotions: false,
    people: false,
    quality: false,
    insights: false,
    billing: false,
    website: false,
    system: true,
  })

  function toggle(key: string) {
    setOpen((s) => ({ ...s, [key]: !s[key] }))
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarTrigger />
      <SidebarContent className="bg-black text-white">
        <div className="px-3 py-4 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-3">
            <Image
              src={logoUrl}
              alt="OrderFly Logo"
              width={144}
              height={40}
              priority
              style={{ width: 'auto', height: 'auto' }}
              className="object-contain"
            />
          </div>
        </div>

        {groups.map((group) => {
          const isOpen = !!open[group.key]
          return (
            <SidebarGroup key={group.key}>
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="flex w-full items-center justify-between px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-white group-data-[collapsible=icon]:hidden"
              >
                <span>{group.title}</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : '')} />
              </button>

              {isOpen && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const active = pathname === item.href
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild>
                            <Link
                              href={item.href}
                              className={cn(
                                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                                active
                                  ? 'bg-white/10 text-white'
                                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
                              )}
                            >
                              <item.icon className={cn('h-4 w-4', active ? 'text-white' : 'text-gray-400')} />
                              <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
