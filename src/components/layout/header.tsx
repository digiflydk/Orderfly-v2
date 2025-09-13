
'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { Brand, NavLink, GeneralSettings } from "@/types";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

interface HeaderProps {
  brand: Brand;
  settings: GeneralSettings | null;
}

const fallbackLinks: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/pricing",  label: "Pricing" },
  { href: "/contact",  label: "Contact" },
];


export function Header({ brand, settings }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const isCms = pathname.startsWith('/superadmin/website');

  if (isCms) {
    return null;
  }
  
  const getBackgroundColor = () => {
    const scrolled = settings?.headerScrolledBackgroundColor;
    const initial = settings?.headerInitialBackgroundColor;
    const scrolledOpacity = (settings?.headerScrolledBackgroundOpacity ?? 95) / 100;
    const initialOpacity = (settings?.headerInitialBackgroundOpacity ?? 0) / 100;

    if (isScrolled) {
      if(scrolled) {
        return `hsla(${scrolled.h}, ${scrolled.s}%, ${scrolled.l}%, ${scrolledOpacity})`;
      }
      return 'hsl(var(--background))';
    }
    if (!isScrolled && initial) {
       return `hsla(${initial.h}, ${initial.s}%, ${initial.l}%, ${initialOpacity})`;
    }
    return 'transparent';
  };

  const headerStyles: React.CSSProperties = {
      position: settings?.headerIsSticky || pathname !== `/${brand.slug}` ? 'fixed' : 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      transition: 'all 0.3s ease-in-out',
      backgroundColor: getBackgroundColor(),
      boxShadow: isScrolled ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
      borderBottom: isScrolled ? '1px solid hsl(var(--border))' : 'none',
      height: settings?.headerHeight ? `${settings.headerHeight}px` : '64px',
  };
  
  const logoStyles: React.CSSProperties = {
    width: settings?.headerLogoWidth ? `${settings.headerLogoWidth}px` : '96px',
  };

  const navLinkStyles: React.CSSProperties = {
      fontSize: settings?.headerLinkSize ? `${settings.headerLinkSize}px` : undefined,
  };
  
  const getLinkHref = (href: string) => {
    if (href.startsWith('#') && pathname !== '/') {
        return `/${href}`;
    }
    return href;
  };
  
  const logoUrl = pathname === '/' ? settings?.logoUrl : brand.logoUrl;
  const logoAlt = pathname === '/' ? (settings?.websiteTitle || 'OrderFly') : (brand.name || 'OrderFly');
  const navLinks = settings?.headerNavLinks?.length ? settings.headerNavLinks : fallbackLinks;

  return (
    <header
      className={cn(
        "w-full"
      )}
      style={headerStyles}
    >
      <div className="mx-auto flex h-full max-w-[1140px] items-center justify-between px-4">
        <Link href={`/${brand.slug}`} className="flex items-center">
            <div className="relative h-full" style={logoStyles}>
                <Image
                    src={logoUrl || '/orderfly-logo-dark.svg'}
                    alt={logoAlt}
                    fill
                    className="object-contain"
                    data-ai-hint="logo"
                />
            </div>
        </Link>
        <nav className="hidden md:flex items-center space-x-6">
            {navLinks.map((link: NavLink) => (
                <Link 
                    key={link.href} 
                    href={getLinkHref(link.href)} 
                    className={cn(
                        "text-sm font-medium transition-colors", 
                        isScrolled ? (settings?.headerLinkColor || 'text-foreground') : 'text-white',
                        `hover:${settings?.headerLinkHoverColor || 'text-primary'}`
                    )}
                    style={navLinkStyles}
                >
                    {link.label}
                </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
