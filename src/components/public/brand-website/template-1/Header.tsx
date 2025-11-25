
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import type { DesignSystem } from "@/lib/types/brandWebsite";

export type Template1HeaderProps = {
  logoUrl: string | null;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

export function Header({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 transition-all duration-300 bg-[var(--template1-color-headerBackground)] text-[var(--template1-color-textPrimary)]">
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
        <Link href="/esmeralda" className="z-50">
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo" width={90} height={45} priority data-ai-hint="logo" />
          ) : (
            <span className="text-xl font-bold">Brand</span>
          )}
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map(item => (
            <Link key={item.label} href={item.href} className="text-sm font-semibold hover:text-[var(--template1-color-primary)] transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Button
            asChild
            className="hidden md:flex bg-[var(--template1-color-primary)] hover:bg-[var(--template1-color-primary)]/90 text-[var(--template1-color-buttonText,white)] rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors">
            <a href={orderHref}>Order now</a>
          </Button>
          <button
            className="md:hidden z-50"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {isMenuOpen && (
        <div className="md:hidden absolute top-0 left-0 w-full h-screen bg-[var(--template1-color-background)] flex flex-col items-center justify-center gap-8">
          <nav className="flex flex-col items-center gap-8">
            {navItems.map(item => (
              <Link key={item.label} href={item.href} className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Button
            asChild
            className="bg-[var(--template1-color-primary)] hover:bg-[var(--template1-color-primary)]/90 text-primary-foreground rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors mt-8">
            <a href={orderHref}>Order now</a>
          </Button>
        </div>
      )}
    </header>
  );
}
