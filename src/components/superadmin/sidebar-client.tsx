
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, LayoutDashboard, Shield, Store, CreditCard, Users, Settings, Utensils, ChevronDown, MapPin, WheatOff, Drumstick, Milk, Shell, Pizza, UserSearch, Star, ShoppingCart, BarChart3, UserCog, Package, Megaphone, Tags, BadgePercent, TestTube2, FileDiff, Palette, MessageSquareQuote, Cookie, LineChart, ExternalLink, UtensilsCrossed, Settings2, Globe, Brush, HeartHandshake } from 'lucide-react';
import { useState, useEffect } from 'react';
import Image from 'next/image';

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { OrderFlyLogo } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { hasPermission } from '@/lib/permissions';
import type { PlatformBrandingSettings } from '@/types';

const salesSubMenuItems = [
    { href: '/superadmin/sales/dashboard', label: 'Dashboard', icon: BarChart3, permission: 'orders:view' },
    { href: '/superadmin/sales/orders', label: 'All Orders', icon: ShoppingCart, permission: 'orders:view' },
]

const marketingSubMenuItems = [
    { href: '/superadmin/upsells', label: 'Upsells', icon: Megaphone, permission: 'products:manage' },
    { href: '/superadmin/combos', label: 'Combos', icon: Package, permission: 'products:manage' },
    { href: '/superadmin/discounts', label: 'Discount Codes', icon: Tags, permission: 'products:manage' },
    { href: '/superadmin/standard-discounts', label: 'Standard Discounts', icon: BadgePercent, permission: 'products:manage' },
]

const customerSubMenuItems = [
    { href: '/superadmin/customers', label: 'All Customers', icon: UserSearch, permission: 'users:view' }, // Re-using user permission
    { href: '/superadmin/loyalty', label: 'Loyalty Settings', icon: Star, permission: 'settings:edit' }, // Re-using settings permission
]

const brandSubMenuItems = [
    { href: '/superadmin/brands', label: 'All Brands', icon: Store, permission: 'brands:view' },
    { href: '/superadmin/locations', label: 'All Locations', icon: MapPin, permission: 'locations:view' },
]

const productSubMenuItems = [
    { href: '/superadmin/products', label: 'All Products', icon: Drumstick, permission: 'products:view' },
    { href: '/superadmin/categories', label: 'Categories', icon: Milk, permission: 'products:view' },
    { href: '/superadmin/toppings', label: 'Toppings', icon: Shell, permission: 'products:view' },
    { href: '/superadmin/allergens', label: 'Allergens', icon: WheatOff, permission: 'products:view' },
]

const validationSubMenuItems = [
    { href: '/superadmin/discount-validation', label: 'Standard Discounts', icon: TestTube2, permission: 'settings:edit' },
    { href: '/superadmin/offers-combos-validation', label: 'Offers & Combos', icon: TestTube2, permission: 'settings:edit' },
    { href: '/superadmin/ui-validation', label: 'UI Validation', icon: Palette, permission: 'settings:edit' },
]

const feedbackSubMenuItems = [
    { href: '/superadmin/feedback', label: 'All Feedback', icon: MessageSquareQuote, permission: 'orders:view' },
    { href: '/superadmin/feedback/questions', label: 'Questions', icon: UserCog, permission: 'settings:edit' },
    { href: '/superadmin/feedback/settings', label: 'Settings', icon: Settings, permission: 'settings:edit' },
];

const analyticsSubMenuItems = [
    { href: '/superadmin/analytics/cust-funnel', label: 'Cust. Funnel', icon: LineChart, permission: 'settings:view' },
    { href: '/superadmin/analytics/cookies', label: 'Cookies', icon: Cookie, permission: 'settings:view' },
];

const websiteSubMenuItems = [
    { href: "/superadmin/website/dashboard", label: "Design", icon: Brush, permission: 'settings:edit'},
    { href: "/superadmin/website/pages", label: "Pages", icon: FileText, permission: 'settings:edit'},
    { href: "/superadmin/website/leads", label: "Cust. Leads", icon: Users, permission: 'settings:edit'},
    { href: "/superadmin/website/customers", label: "Customers", icon: HeartHandshake, permission: 'settings:edit'},
    { href: "/superadmin/website/settings", label: "Settings", icon: Settings, permission: 'settings:edit'},
];

const settingsSubMenuItems = [
    { href: '/superadmin/settings', label: 'General', icon: Settings2, permission: 'settings:edit' },
    { href: '/superadmin/food-categories', label: 'Food Categories', icon: UtensilsCrossed, permission: 'brands:edit' },
    { href: '/superadmin/subscriptions', label: 'Subscriptions', icon: FileText, permission: 'subscriptions:manage' },
    { href: '/superadmin/billing', label: 'Billing', icon: CreditCard, permission: 'billing:view' },
    { href: '/superadmin/users', label: 'Admin Users', icon: Users, permission: 'users:view' },
    { href: '/superadmin/roles', label: 'Roles & Permissions', icon: UserCog, permission: 'roles:manage' },
];


interface SuperAdminSidebarClientProps {
  brandingSettings: PlatformBrandingSettings;
}

export function SuperAdminSidebarClient({ brandingSettings }: SuperAdminSidebarClientProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isSalesPath = salesSubMenuItems.some(item => pathname.startsWith(item.href));
  const isMarketingPath = marketingSubMenuItems.some(item => pathname.startsWith(item.href));
  const isCustomersPath = customerSubMenuItems.some(item => pathname.startsWith(item.href));
  const isBrandsPath = brandSubMenuItems.some(item => pathname.startsWith(item.href));
  const isProductsPath = productSubMenuItems.some(item => pathname.startsWith(item.href));
  const isValidationPath = validationSubMenuItems.some(item => pathname.startsWith(item.href));
  const isFeedbackPath = feedbackSubMenuItems.some(item => pathname.startsWith(item.href));
  const isAnalyticsPath = analyticsSubMenuItems.some(item => pathname.startsWith(item.href));
  const isWebsitePath = pathname.startsWith('/superadmin/website');
  const isSettingsPath = settingsSubMenuItems.some(item => pathname.startsWith(item.href));
  
  const [isSalesOpen, setIsSalesOpen] = useState(isSalesPath);
  const [isMarketingOpen, setIsMarketingOpen] = useState(isMarketingPath);
  const [isCustomersOpen, setIsCustomersOpen] = useState(isCustomersPath);
  const [isBrandsOpen, setIsBrandsOpen] = useState(isBrandsPath);
  const [isProductsOpen, setIsProductsOpen] = useState(isProductsPath);
  const [isValidationOpen, setIsValidationOpen] = useState(isValidationPath);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(isFeedbackPath);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(isAnalyticsPath);
  const [isWebsiteOpen, setIsWebsiteOpen] = useState(isWebsitePath);
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsPath);

  const visibleSalesItems = salesSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleMarketingItems = marketingSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleCustomerItems = customerSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleBrandItems = brandSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleProductItems = productSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleValidationItems = validationSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleFeedbackItems = feedbackSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleAnalyticsItems = analyticsSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleWebsiteItems = websiteSubMenuItems.filter(item => hasPermission(item.permission));
  const visibleSettingsItems = settingsSubMenuItems.filter(item => hasPermission(item.permission));
  
  const dashboardItem = { href: '/superadmin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'users:view' };
  const codeReviewItem = { href: '/superadmin/code-review', label: 'Code Review', icon: FileDiff, permission: 'settings:edit' };
  
  const mainMenuItems = [
    { name: 'Sales & Orders', isOpen: isSalesOpen, onOpenChange: setIsSalesOpen, isPath: isSalesPath, icon: ShoppingCart, items: visibleSalesItems },
    { name: 'Customers', isOpen: isCustomersOpen, onOpenChange: setIsCustomersOpen, isPath: isCustomersPath, icon: Users, items: visibleCustomerItems },
    { name: 'Brands', isOpen: isBrandsOpen, onOpenChange: setIsBrandsOpen, isPath: isBrandsPath, icon: Store, items: visibleBrandItems },
    { name: 'Products', isOpen: isProductsOpen, onOpenChange: setIsProductsOpen, isPath: isProductsPath, icon: Utensils, items: visibleProductItems },
    { name: 'Marketing', isOpen: isMarketingOpen, onOpenChange: setIsMarketingOpen, isPath: isMarketingPath, icon: Megaphone, items: visibleMarketingItems },
    { name: 'Feedback', isOpen: isFeedbackOpen, onOpenChange: setIsFeedbackOpen, isPath: isFeedbackPath, icon: MessageSquareQuote, items: visibleFeedbackItems },
    { name: 'Analytics', isOpen: isAnalyticsOpen, onOpenChange: setIsAnalyticsOpen, isPath: isAnalyticsPath, icon: BarChart3, items: visibleAnalyticsItems },
  ];

  const handleMobileNavClick = () => {
    setOpenMobile(false);
  }

  return (
    <>
      <SidebarHeader>
        <div className="flex w-full items-center justify-between group-data-[collapsible=expanded]:justify-between group-data-[collapsible=icon]:justify-center">
            {/* Mobile Trigger */}
            <div className="md:hidden">
              <SidebarTrigger />
            </div>

            {/* Desktop Trigger */}
            <div className="hidden md:flex">
              <SidebarTrigger />
            </div>
            
            {/* Brand Logo */}
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
                {brandingSettings.platformLogoUrl ? (
                    <Image src={brandingSettings.platformLogoUrl} alt="OrderFly Logo" width={120} height={32} className="object-contain" data-ai-hint="logo" />
                ) : (
                    <>
                      <OrderFlyLogo className="size-8 text-sidebar-foreground" />
                      <h1 className="font-headline text-xl font-bold text-sidebar-foreground">
                          OrderFly
                      </h1>
                    </>
                )}
            </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {/* Dashboard */}
          {hasPermission(dashboardItem.permission) && (
            <SidebarMenuItem onClick={handleMobileNavClick}>
              <Button asChild variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(dashboardItem.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                <Link href={dashboardItem.href}>
                  <dashboardItem.icon className="mr-2 h-4 w-4" />
                  {dashboardItem.label}
                </Link>
              </Button>
            </SidebarMenuItem>
          )}

          {/* Main Collapsible Menus */}
          {mainMenuItems.map(menu => (
            menu.items.length > 0 && (
              <SidebarMenuItem key={menu.name}>
                  <Collapsible open={menu.isOpen} onOpenChange={menu.onOpenChange}>
                      <CollapsibleTrigger asChild>
                          <Button variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", menu.isPath && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                              <menu.icon className="mr-2 h-4 w-4" />
                              <span className="group-data-[collapsible=icon]:hidden">{menu.name}</span>
                              <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden", menu.isOpen && "rotate-180")} />
                          </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                          {menu.items.map(item => (
                              <SidebarMenuSubItem key={item.label} onClick={handleMobileNavClick}>
                                  <Button asChild variant={'ghost'} className={cn("w-full justify-start h-8 pl-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                                      <Link href={item.href}>
                                          <item.icon className="mr-2 h-4 w-4" />
                                          {item.label}
                                      </Link>
                                  </Button>
                              </SidebarMenuSubItem>
                          ))}
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
              </SidebarMenuItem>
            )
          ))}

          <Separator />
           
            {/* Website Collapsible Menu */}
            {visibleWebsiteItems.length > 0 && (
            <SidebarMenuItem>
                <Collapsible open={isWebsiteOpen} onOpenChange={setIsWebsiteOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isWebsitePath && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                            <Globe className="mr-2 h-4 w-4" />
                            <span className="group-data-[collapsible=icon]:hidden">Website</span>
                            <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden", isWebsiteOpen && "rotate-180")} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub>
                        {visibleWebsiteItems.map(item => (
                            <SidebarMenuSubItem key={item.label} onClick={handleMobileNavClick}>
                                <Button asChild variant={'ghost'} className={cn("w-full justify-start h-8 pl-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                                    <Link href={item.href}>
                                        <item.icon className="mr-2 h-4 w-4" />
                                        {item.label}
                                    </Link>
                                </Button>
                            </SidebarMenuSubItem>
                        ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
            </SidebarMenuItem>
           )}

           {/* Settings Collapsible Menu */}
           {visibleSettingsItems.length > 0 && (
            <SidebarMenuItem>
                <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isSettingsPath && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                            <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden", isSettingsOpen && "rotate-180")} />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub>
                        {visibleSettingsItems.map(item => (
                            <SidebarMenuSubItem key={item.label} onClick={handleMobileNavClick}>
                                <Button asChild variant={'ghost'} className={cn("w-full justify-start h-8 pl-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                                    <Link href={item.href}>
                                        <item.icon className="mr-2 h-4 w-4" />
                                        {item.label}
                                    </Link>
                                </Button>
                            </SidebarMenuSubItem>
                        ))}
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </Collapsible>
            </SidebarMenuItem>
           )}


          {/* Validation Collapsible Menu - Moved Here */}
          {visibleValidationItems.length > 0 && (
              <SidebarMenuItem>
                  <Collapsible open={isValidationOpen} onOpenChange={setIsValidationOpen}>
                      <CollapsibleTrigger asChild>
                          <Button variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isValidationPath && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                              <TestTube2 className="mr-2 h-4 w-4" />
                              <span className="group-data-[collapsible=icon]:hidden">Validation</span>
                              <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden", isValidationOpen && "rotate-180")} />
                          </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                          {visibleValidationItems.map(item => (
                              <SidebarMenuSubItem key={item.label} onClick={handleMobileNavClick}>
                                  <Button asChild variant={'ghost'} className={cn("w-full justify-start h-8 pl-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(item.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                                      <Link href={item.href}>
                                          <item.icon className="mr-2 h-4 w-4" />
                                          {item.label}
                                      </Link>
                                  </Button>
                              </SidebarMenuSubItem>
                          ))}
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
              </SidebarMenuItem>
          )}

           {/* Code Review Item */}
          {hasPermission(codeReviewItem.permission) && (
            <SidebarMenuItem onClick={handleMobileNavClick}>
              <Button asChild variant={'ghost'} className={cn("w-full justify-start hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", pathname.startsWith(codeReviewItem.href) && "bg-sidebar-accent text-sidebar-accent-foreground")}>
                <Link href={codeReviewItem.href}>
                  <codeReviewItem.icon className="mr-2 h-4 w-4" />
                  {codeReviewItem.label}
                </Link>
              </Button>
            </SidebarMenuItem>
          )}

          {/* Exit Button */}
          <SidebarMenuItem onClick={handleMobileNavClick}>
              <Button asChild variant="ghost" className="w-full justify-start text-muted-foreground hover:bg-sidebar-accent hover:text-primary">
                  <Link href="/admin/dashboard">
                      <Shield className="mr-2 h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Exit SuperAdmin</span>
                  </Link>
              </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
            <div className="flex items-center gap-3 p-2 group-data-[collapsible=icon]:hidden">
                <Avatar>
                    <AvatarImage src="https://placehold.co/40x40" />
                    <AvatarFallback>SA</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold">Super Admin</span>
                    <span className="text-xs text-muted-foreground">super@orderfly.app</span>
                </div>
            </div>
        </div>
      </SidebarFooter>
    </>
  );
}
