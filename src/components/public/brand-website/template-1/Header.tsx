
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { Template1HeaderProps } from '@/types/website';
import { cn } from '@/lib/utils';
import { Template1Button } from './Template1Button';

export function Header({
  logoUrl,
  logoAlt,
  navItems,
  orderHref,
  ctaLabel,
}: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <header data-header>
      <div
        className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        style={{
          fontFamily: 'var(--template1-font-family-body)',
        }}
      >
        <Link href="/" className="flex items-center gap-2" aria-label={logoAlt}>
          {logoUrl ? (
             <div className="relative flex items-center" style={{ width: 'var(--logo-width)' }}>
                 <Image
                  src={logoUrl}
                  alt={logoAlt || 'Brand Logo'}
                  width={120}
                  height={40}
                  style={{ width: '100%', height: 'auto' }}
                  priority
                />
            </div>
          ) : (
            <span className="text-xl font-bold">{logoAlt}</span>
          )}
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm" style={{
                color: 'var(--template1-color-text-primary)',
                fontFamily: 'var(--template1-font-family-body)',
            }}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Template1Button asChild className="hidden md:flex" variant="primary">
            <Link href={orderHref}>{ctaLabel}</Link>
          </Template1Button>
          <button
            className="z-50 md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {isMenuOpen && (
        <div className="absolute left-0 top-0 flex h-screen w-full flex-col items-center justify-center gap-8 bg-background md:hidden">
          <nav className="flex flex-col items-center gap-8">
            {navItems.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xl font-semibold"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Template1Button asChild size="lg" variant="primary">
            <Link href={orderHref}>{ctaLabel}</Link>
          </Template1Button>
        </div>
      )}
    </header>
  );
}
