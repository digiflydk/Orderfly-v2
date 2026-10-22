'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Portal menu for signed-in members. Links stay on the customer's address (base).
export function ClubNav({ base, programName }: { base: string; programName: string }) {
  const pathname = (usePathname() ?? '').replace(/\/$/, '');
  // The browser path is /club/… on a brand subdomain and /{slug}/club/… on orderfly.dk.
  const current = (href: string) => pathname === href || pathname.endsWith(href.slice(href.indexOf('/club')));
  const items = [[base, 'Kort'], [`${base}/historik`, 'Historik'], [`${base}/profil`, 'Profil']] as const;
  return (
    <nav aria-label={`Menu for ${programName}`} className="club-member-nav mb-6 grid grid-cols-3 gap-2">
      {items.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current(href) ? 'page' : undefined}
          className="flex min-h-11 items-center justify-center rounded-md border text-base aria-[current=page]:border-primary aria-[current=page]:font-semibold">
          {label}
        </Link>
      ))}
    </nav>
  );
}
