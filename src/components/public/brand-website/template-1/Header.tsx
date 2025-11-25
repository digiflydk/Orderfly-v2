// src/components/public/brand-website/template-1/Header.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type Template1HeaderProps = {
  logoUrl: string | null;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

export function Header({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              {logoUrl ? (
                <Image src={logoUrl} alt="Brand Logo" width={100} height={40} className="object-contain" />
              ) : (
                <span className="font-bold">Brand</span>
              )}
            </Link>
            <nav className="hidden gap-6 md:flex">
              {navItems.map((item) => (
                <Link key={item.label} href={item.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild className="hidden md:flex">
              <a href={orderHref}>Order Now</a>
            </Button>
            <Sheet open={isMobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                    <SheetTitle asChild>
                        <Link href="/" className="flex items-center gap-2 font-semibold">
                            {logoUrl ? (
                                <Image src={logoUrl} alt="Brand Logo" width={100} height={40} className="object-contain" />
                            ) : (
                                <span className="font-bold">Brand</span>
                            )}
                        </Link>
                    </SheetTitle>
                </SheetHeader>
                <nav className="mt-8 flex flex-col gap-4">
                  {navItems.map((item) => (
                    <Link key={item.label} href={item.href} className="text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
       {/* Sticky Bottom CTA for Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t">
        <Button asChild size="lg" className="w-full">
            <a href={orderHref} className="flex items-center justify-center gap-2">
                <ShoppingCart className="h-5 w-5"/>
                Order Now
            </a>
        </Button>
      </div>
    </header>
  );
}
