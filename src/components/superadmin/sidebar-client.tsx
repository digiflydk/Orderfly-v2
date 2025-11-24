
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
  Settings as SettingsIcon,
  Code2,
  LayoutTemplate,
  ChevronDown,
  FileText,
  Palette,
  UserPlus,
  SlidersHorizontal,
  Sparkles,
  Search,
  Share2,
  Activity,
  Cookie,
  Beaker,
  Eye,
} from 'lucide-react'

type MenuIcon = React.ComponentType<{ className?: string }>

type Item = {
  label: string
  href?: string
  icon?: MenuIcon
  children?: Item[]
}

type Group = {
  key: string
  title: string
  items: Item[]
}

function isActive(pathname: string, href?: string) {
  if (!href) return false
  if (href === '/superadmin') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/')
}

export function SuperAdminSidebarClient({
  brandingSettings,
}: {
  brandingSettings?: PlatformBrandingSettings
}) {
  const pathname = usePathname()

  const logoUrl =
    brandingSettings?.platformLogoUrl ||
    'https://i.postimg.cc/HxTMqLGV/Orderfly-Logo-white-F.png'

  const groups: Group[] = [
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
        { 
          label: 'Feedback', 
          icon: MessageSquare,
          children: [
            { href: '/superadmin/feedback', label: 'Inbox'},
            { href: '/superadmin/feedback/questions', label: 'Questions'},
            { href: '/superadmin/feedback/settings', label: 'Settings'},
          ]
        },
      ],
    },
    { key: 'insights', title: 'Insights', items: [
      { 
        label: 'Analytics', 
        icon: BarChart3,
        children: [
          { href: '/superadmin/analytics/cust-funnel', label: 'Customer Funnel'},
          { href: '/superadmin/analytics/cookies', label: 'Cookie Consents'},
        ]
      },
    ]},
    {
      key: 'billing',
      title: 'Billing',
      items: [
        { href: '/superadmin/billing', label: 'Billing', icon: CreditCard },
        { href: '/superadmin/subscriptions', label: 'Subscriptions', icon: Bookmark },
      ],
    },
    {
      key: 'brand_website',
      title: 'Brand Website',
      items: [
        { href: '/superadmin/brands/websites', label: 'Brands web.', icon: LayoutTemplate },
      ]
    },
    {
      key: 'website',
      title: 'Orderfly Website',
      items: [
        { href: '/superadmin/website/pages', label: 'Pages', icon: FileText },
        { href: '/superadmin/website/design', label: 'Design', icon: Palette },
        { href: '/superadmin/website/leads', label: 'Customer Leads', icon: UserPlus },
        { href: '/superadmin/website/customers', label: 'Customers', icon: Users },
        { 
            label: 'Settings', 
            icon: SettingsIcon, 
            children: [
                { href: '/superadmin/website/settings/general', label: 'General', icon: SlidersHorizontal },
                { href: '/superadmin/website/settings/ai', label: 'AI Prompt', icon: Sparkles },
                { href: '/superadmin/website/settings/seo', label: 'SEO', icon: Search },
                { href: '/superadmin/website/settings/social', label: 'Social Share', icon: Share2 },
                { href: '/superadmin/website/settings/tracking', label: 'Tracking', icon: Activity },
                { href: '/superadmin/website/settings/cookie-texts', label: 'Cookies', icon: Cookie },
            ]
        },
      ],
    },
    {
      key: 'system',
      title: 'System',
      items: [
        { href: '/superadmin/settings', label: 'Settings', icon: SettingsIcon },
        { href: '/superadmin/docs', label: 'Documentation', icon: FileText },
        { href: '/superadmin/code-review', label: 'Code Review', icon: Code2 },
        { href: '/superadmin/qa', label: 'QA', icon: Beaker },
        { href: '/superadmin/ui-validation', label: 'UI Validation', icon: Eye },
      ],
    },
  ]

  const [open, setOpen] = React.useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {
      core: true,
      commerce: true,
      catalog: true,
      promotions: false,
      people: false,
      quality: false,
      insights: true,
      billing: false,
      brand_website: true,
      website: true,
      system: true,
    }
    groups.forEach((g) => {
      const groupHasActive =
        g.items.some((i) => isActive(pathname, i.href)) ||
        g.items.some((i) => (i.children ?? []).some((c) => isActive(pathname, c.href)))
      if (groupHasActive) state[g.key] = true
      g.items.forEach((i) => {
        if ((i.children ?? []).some((c) => isActive(pathname, c.href))) {
          state[`${g.key}:${i.label}`] = true
        }
      })
    })
    return state
  })

  function toggle(key: string) {
    setOpen((s) => ({ ...s, [key]: !s[key] }))
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-black text-white">
        <div className="h-14 border-b border-white/10 px-3 py-2 group-data-[collapsible=icon]:px-2">
          <div className="flex h-full items-center">
            <Image
              src={logoUrl}
              alt="OrderFly Logo"
              width={132}
              height={36}
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

              <SidebarGroupContent className={cn(isOpen ? 'block' : 'hidden group-data-[collapsible=icon]:block')}>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const hasChildren = (item.children ?? []).length > 0

                    if (!hasChildren) {
                      const active = isActive(pathname, item.href)
                      const Icon = item.icon ?? LayoutTemplate
                      return (
                        <SidebarMenuItem key={item.label}>
                          <SidebarMenuButton asChild>
                            <Link
                              href={item.href ?? '#'}
                              className={cn(
                                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                                active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                              )}
                            >
                              <Icon className={cn('h-4 w-4', active ? 'text-white' : 'text-gray-400')} />
                              <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    }

                    const key = `${group.key}:${item.label}`
                    const parentOpen = !!open[key]
                    const ParentIcon = item.icon ?? LayoutTemplate

                    return (
                      <React.Fragment key={`${item.label}-group`}>
                        <SidebarMenuItem>
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white group-data-[collapsible=icon]:hidden"
                          >
                            <ParentIcon className="h-4 w-4 text-gray-400" />
                            <span>{item.label}</span>
                            <ChevronDown
                              className={cn('ml-auto h-4 w-4 transition-transform', parentOpen ? 'rotate-180' : '')}
                            />
                          </button>
                        </SidebarMenuItem>

                        {parentOpen && (
                          <SidebarMenu key={`${item.label}-children`} className="ml-6 space-y-1 group-data-[collapsible=icon]:hidden">
                            {(item.children ?? []).map((child) => {
                              const activeChild = isActive(pathname, child.href)
                              const CIcon = child.icon ?? LayoutTemplate
                              return (
                                <SidebarMenuItem key={child.href ?? child.label}>
                                  <SidebarMenuButton asChild>
                                    <Link
                                      href={child.href ?? '#'}
                                      className={cn(
                                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                                        activeChild ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                      )}
                                    >
                                      <CIcon className={cn('h-4 w-4', activeChild ? 'text-white' : 'text-gray-400')} />
                                      <span>{child.label}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              )
                            })}
                          </SidebarMenu>
                        )}
                      </React.Fragment>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}
