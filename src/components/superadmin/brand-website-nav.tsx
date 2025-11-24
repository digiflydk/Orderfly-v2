'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BrandWebsiteNavProps {
  brandId: string;
}

export function BrandWebsiteNav({ brandId }: BrandWebsiteNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/superadmin/brands/${brandId}/website/config`, label: 'Config' },
    { href: `/superadmin/brands/${brandId}/website/home`, label: 'Homepage' },
    { href: `/superadmin/brands/${brandId}/website/pages`, label: 'Pages' },
    { href: `/superadmin/brands/${brandId}/website/menu-settings`, label: 'Menu Settings' },
  ];
  
  const getActiveTab = () => {
    // Find the most specific match first
    const exactMatch = navItems.find(item => item.href === pathname);
    if (exactMatch) return exactMatch.href;
    // Fallback for sub-pages, e.g. /pages/edit/..
    const parentMatch = navItems.find(item => pathname.startsWith(item.href));
    return parentMatch?.href || navItems[0].href;
  }
  
  const activeTabValue = getActiveTab();

  return (
    <Tabs value={activeTabValue} className="mb-6">
      <TabsList>
        {navItems.map((item) => (
          <TabsTrigger key={item.href} value={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
