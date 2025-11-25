'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Template1Button } from './Template1Button';
import { cn } from '@/lib/utils';

export type Template1HeaderProps = {
  logoUrl: string | null;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

export function Header({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 transition-colors duration-300',
          isScrolled ? 'bg-[var(--template1-color-header-background)] shadow-md' : 'bg-transparent'
        )}
      >
        <div
          className="container mx-auto flex max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8"
          style={{ height: 'var(--template1-header-height, 80px)' }}
        >
          <Link href="/m3pizza" className="z-50">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Brand Logo"
                width={120}
                height={40}
                priority
                style={{ width: 'var(--template1-header-logo-width, 120px)', height: 'auto' }}
              />
            ) : (
              <span className="text-xl font-bold">Brand</span>
            )}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  fontSize: 'var(--template1-font-size-button)',
                  fontWeight: 'var(--template1-button-font-weight)',
                }}
                className="text-sm font-semibold text-[var(--template1-color-text-primary)] hover:text-[var(--template1-color-primary)] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Template1Button href={orderHref} variant="primary" className="hidden md:flex">
              Order Now
            </Template1Button>
            <button
              className="md:hidden z-50"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-0 left-0 w-full h-screen bg-[var(--template1-color-background)] flex flex-col items-center justify-center gap-8">
            <nav className="flex flex-col items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-xl font-semibold hover:text-[var(--template1-color-primary)] transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Sticky Bottom CTA on Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden p-4 bg-transparent pointer-events-none">
          <Template1Button href={orderHref} variant="primary" className="w-full pointer-events-auto">
            Order Now
          </Template1Button>
      </div>
      {/* Spacer for sticky CTA */}
      <div className="h-20 md:hidden" />
    </>
  );
}
