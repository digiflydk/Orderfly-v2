
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionCompletionStatus {
  config: boolean;
  home: boolean;
  pages: boolean;
  menuSettings: boolean;
}

interface BrandWebsiteNavProps {
  brandId: string;
  completionStatus: SectionCompletionStatus;
}

export function BrandWebsiteNav({ brandId, completionStatus }: BrandWebsiteNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/superadmin/brands/${brandId}/website/config`, label: 'Config', key: 'config' as keyof SectionCompletionStatus },
    { href: `/superadmin/brands/${brandId}/website/home`, label: 'Homepage', key: 'home' as keyof SectionCompletionStatus },
    { href: `/superadmin/brands/${brandId}/website/pages`, label: 'Pages', key: 'pages' as keyof SectionCompletionStatus },
    { href: `/superadmin/brands/${brandId}/website/menu-settings`, label: 'Menu Settings', key: 'menuSettings' as keyof SectionCompletionStatus },
  ];
  
  const getActiveTab = () => {
    const exactMatch = navItems.find(item => item.href === pathname);
    if (exactMatch) return exactMatch.href;
    const parentMatch = navItems.find(item => pathname.startsWith(item.href));
    return parentMatch?.href || navItems[0].href;
  }
  
  const activeTabValue = getActiveTab();

  return (
    <Tabs value={activeTabValue} className="mb-6">
      <TabsList>
        {navItems.map((item) => {
            const isComplete = completionStatus[item.key];
            return (
                <TabsTrigger key={item.href} value={item.href} asChild>
                    <Link href={item.href}>
                        {item.label}
                        {isComplete && (
                           <CheckCircle2 className="ml-2 h-4 w-4 text-green-500"/>
                        )}
                    </Link>
                </TabsTrigger>
            )
        })}
      </TabsList>
    </Tabs>
  );
}
