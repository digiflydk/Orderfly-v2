'use client';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/header';
import M3Footer from '@/components/layout/M3Footer';
import type { WebsiteHeaderConfig } from '@/types/website';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// Local NavLink type
type NavLink = {
  label: string;
  href: string;
  type?: "default" | "primary" | "secondary";
};

export interface Template1PageProps {
    children: React.ReactNode;
    headerProps?: {
        header: WebsiteHeaderConfig;
        ctaText: string;
        orderHref: string;
        navLinks?: NavLink[];
    };
    footerProps?: any;
}

function GenericHeader({ onOrderClick }: { onOrderClick: () => void }) {
    return (
        <header className="sticky top-0 z-50 bg-m3-cream shadow-md">
            <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
                <Link href="/m3" className="z-50">
                    {/* Placeholder until logo is from config */}
                    <span className="font-bold text-lg">Orderfly</span>
                </Link>
                <nav className="hidden md:flex items-center gap-8">
                    <Link href="#" className="text-sm font-semibold hover:text-m3-orange transition-colors">Menu</Link>
                </nav>
                <div className="flex items-center gap-4">
                    <Button
                        onClick={onOrderClick}
                        className="hidden md:flex bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors">
                        Order Now
                    </Button>
                </div>
            </div>
        </header>
    );
}


export function Template1Page({
  children,
  headerProps,
  footerProps,
}: Template1PageProps) {
  const pathname = usePathname();

  const handleOrderClick = () => {
    // Navigate or open modal, logic based on headerProps if they exist
    if (headerProps?.orderHref) {
      window.location.href = headerProps.orderHref;
    } else {
      console.log("Order action triggered, but no href provided.");
    }
  };

  return (
    <div className="bg-m3-cream min-h-screen">
        {!headerProps ? (
            <GenericHeader onOrderClick={handleOrderClick} />
        ) : (
            <Header
                config={headerProps.header}
                navLinks={headerProps.navLinks}
            />
        )}
      <main>{children}</main>
      <M3Footer />
    </div>
  );
}
