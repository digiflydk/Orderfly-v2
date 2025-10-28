
"use client";

import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-m3-dark text-m3-white">
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-1 space-y-4">
          <Image src="https://i.postimg.cc/PqYpW1s1/logo.png" alt="M3 Pizza" width={90} height={45} data-ai-hint="logo" />
          <p className="text-sm text-neutral-300">
            Den bedste pizzaoplevelse i Danmark – byg din egen eller vælg en af vores signaturmenuer.
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-4">Menu</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">Alle pizzaer</Link></li>
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">Byg din egen</Link></li>
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">Drikkevarer</Link></li>
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">Dips & Sider</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-4">Medlemskab</h4>
           <ul className="space-y-2 text-sm">
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">M3Point</Link></li>
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">M3Plus</Link></li>
            <li><Link href="#" className="text-neutral-300 hover:text-m3-orange transition-colors">Bliv medlem</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-4">Følg os</h4>
          <div className="flex gap-4">
            <Link href="#" aria-label="Facebook"><Image src="https://i.postimg.cc/pT2C2kGk/icon-facebook.png" alt="Facebook" width={24} height={24} /></Link>
            <Link href="#" aria-label="Instagram"><Image src="https://i.postimg.cc/R0B1nfk8/icon-instagram.png" alt="Instagram" width={24} height={24} /></Link>
          </div>
        </div>
      </div>
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6 border-t border-neutral-700 text-center">
        <p className="text-xs text-neutral-400">© 2025 M3 Pizza. Alle rettigheder forbeholdes. • 1.0.223 • OF-390</p>
        <div className="flex justify-center gap-4 mt-2">
            <Link href="#" className="text-xs text-neutral-400 hover:text-m3-orange transition-colors">Privatlivspolitik</Link>
            <Link href="#" className="text-xs text-neutral-400 hover:text-m3-orange transition-colors">Cookiepolitik</Link>
        </div>
      </div>
    </footer>
  );
}
