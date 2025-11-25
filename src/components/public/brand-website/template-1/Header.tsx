
'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerClose,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import SiteLogo from '@/components/common/SiteLogo';

export type Template1HeaderProps = {
  logoUrl: string | null;
  logoAlt?: string;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

export function Header({ logoUrl, logoAlt, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const headerStyle = {
    fontFamily: 'var(--template1-font-family)',
  } as React.CSSProperties;

  const navLinkStyle = {
    fontSize: 'var(--template1-font-size-nav)',
  } as React.CSSProperties;

  const buttonStyle = {
    fontSize: 'var(--template1-font-size-button)',
  } as React.CSSProperties;

  return (
    <>
      <header className="h-[var(--header-height)]" style={headerStyle}>
        <div className="container mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="relative flex items-center" style={{ width: 'var(--logo-width)' }}>
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={logoAlt || 'Logo'}
                fill
                priority
                className="object-contain"
              />
            ) : (
              <SiteLogo text={logoAlt} className="text-2xl font-bold" />
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="transition-colors"
                style={navLinkStyle}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-4 md:flex">
            <Button asChild style={buttonStyle}>
              <a href={orderHref}>Bestil Nu</a>
            </Button>
          </div>

          {/* Mobile Burger Menu */}
          <div className="md:hidden">
            <Drawer direction="right" open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DrawerTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DrawerTrigger>
              <DrawerContent className="h-full w-[85%] max-w-sm bg-background p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Menu</h2>
                   <DrawerClose asChild>
                    <Button variant="ghost" size="icon">
                        <X className="h-6 w-6" />
                        <span className="sr-only">Close menu</span>
                    </Button>
                   </DrawerClose>
                </div>
                 <nav className="mt-8 flex flex-col gap-6">
                    {navItems.map((item) => (
                        <DrawerClose key={item.label} asChild>
                            <Link
                                href={item.href}
                                className="text-lg font-medium transition-colors hover:text-primary"
                            >
                                {item.label}
                            </Link>
                        </DrawerClose>
                    ))}
                </nav>
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </header>

      {/* Mobile Sticky CTA */}
      <div className="md:hidden">
          <div className="h-16" aria-hidden="true" />
          <div
            className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 p-2 backdrop-blur-sm"
          >
            <Button asChild size="lg" className="w-full" style={buttonStyle}>
                <a href={orderHref}>Bestil Nu</a>
            </Button>
          </div>
      </div>
    </>
  );
}
