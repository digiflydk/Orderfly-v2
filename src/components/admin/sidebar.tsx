'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookCopy, LayoutDashboard, Settings, ShoppingBag, ListChecks, Shield } from 'lucide-react';

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { OrderFlyLogo } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '../ui/button';

const menuItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/menu', label: 'Menu', icon: BookCopy },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/backlog', label: 'Backlog', icon: ListChecks },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <OrderFlyLogo className="size-8 text-primary" />
          <h1 className="font-headline text-xl font-bold text-primary group-data-[collapsible=icon]:hidden">
            OrderFly
          </h1>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <Button
                asChild
                variant={pathname.startsWith(item.href) ? 'outline' : 'ghost'}
                className="w-full justify-start"
              >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            </SidebarMenuItem>
          ))}
           <SidebarMenuItem>
             <Button asChild variant="ghost" className="w-full justify-start text-primary hover:text-primary">
               <Link href="/superadmin/dashboard">
                 <Shield className="mr-2 h-4 w-4" />
                 SuperAdmin Panel
               </Link>
             </Button>
           </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <Separator className="my-2" />
        <div className="flex items-center gap-3 p-2">
          <Avatar>
            <AvatarImage src="https://placehold.co/40x40" />
            <AvatarFallback>RA</AvatarFallback>
          </Avatar>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Restaurant Admin</span>
            <span className="text-xs text-muted-foreground">admin@example.com</span>
          </div>
        </div>
      </SidebarFooter>
    </>
  );
}
