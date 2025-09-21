'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Brand, GeneralSettings, NavLink } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import SiteLogo from '../common/SiteLogo';

type Props = {
  brand?: Brand | null;
  settings?: GeneralSettings | null;
  config?: WebsiteHeaderConfig | null;
  navLinks?: NavLink[];
  linkClass?: string;
  logoUrl?: string | null;
  logoAlt?: string;
};

export function Header({ brand, settings, config, navLinks, linkClass, logoUrl, logoAlt }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const effectiveNavLinks = navLinks || settings?.headerNavLinks || [];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  
  const finalLogoUrl = logoUrl || brand?.logoUrl;
  const finalLogoAlt = logoAlt || brand?.name || "Orderfly Logo";
  const finalLinkClass = linkClass || 'text-white hover:text-primary';

  return (
    <header data-header>
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          {finalLogoUrl ? (
            <Image
              src={finalLogoUrl}
              alt={finalLogoAlt}
              width={128}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          ) : (
            <SiteLogo />
          )}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {effectiveNavLinks.map(link => (
            <Link key={link.label} href={link.href} className={cn('text-sm', finalLinkClass)}>
              {link.label}
            </Link>
          ))}
        </nav>

        <button className={cn('md:hidden text-sm', finalLinkClass)} aria-label="Open menu">
          Menu
        </button>
      </div>
    </header>
  );
}
