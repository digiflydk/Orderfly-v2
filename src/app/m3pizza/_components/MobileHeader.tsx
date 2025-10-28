
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 bg-m3-cream border-b border-m3-gray">
      <button aria-label="Open menu">
        <Menu className="h-6 w-6 text-m3-dark" />
      </button>
      <Link href="/m3pizza" className="absolute left-1/2 -translate-x-1/2">
        <Image
          src="https://i.postimg.cc/PqYpW1s1/logo.png"
          alt="M3 Pizza Logo"
          width={70}
          height={35}
          priority
          data-ai-hint="logo"
        />
      </Link>
      {/* Placeholder for right-side icon if any */}
      <div className="w-6"></div>
    </header>
  );
}
