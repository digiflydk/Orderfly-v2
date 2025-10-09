'use client';

import { OrderFlyLogo } from '@/components/icons';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { PlatformBrandingSettings } from '@/types';
import Image from 'next/image';
import Link from 'next/link';

interface MobileHeaderProps {
  brandingSettings: PlatformBrandingSettings;
}

export function MobileHeader({ brandingSettings }: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 md:hidden">
      <SidebarTrigger />
      <div className="flex-1">
        <Link href="/superadmin/dashboard" className="flex items-center gap-2">
          {brandingSettings.platformLogoUrl ? (
            <div className="relative h-8 w-24">
              <Image
                src={brandingSettings.platformLogoUrl}
                alt="Platform Logo"
                fill
                className="object-contain"
                data-ai-hint="logo"
              />
            </div>
          ) : (
            <>
              <OrderFlyLogo className="size-8 text-primary" />
              <h1 className="font-headline text-xl font-bold text-primary">
                OrderFly
              </h1>
            </>
          )}
        </Link>
      </div>
    </header>
  );
}
