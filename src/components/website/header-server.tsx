// src/components/website/header-server.tsx
'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { Header } from '@/components/layout/header';
import { getGeneralSettings } from '@/services/settings';

// En lille helper som oversætter CMS-valg til Tailwind-klasser
function resolveLinkClass(input?: string): string {
  const v = (input || '').toLowerCase().trim();
  switch (v) {
    case 'black':
    case 'sort':
      return 'text-black hover:text-black/70';
    case 'white':
    case 'hvid':
      return 'text-white hover:text-white/80';
    case 'primary':
    case 'brand':
      return 'text-primary hover:text-primary/80';
    case 'secondary':
      return 'text-secondary hover:text-secondary/80';
    default:
      return 'text-white hover:text-primary';
  }
}

export default async function HeaderServer() {
  // Ingen caching, så CMS-ændringer slår igennem efter reload
  noStore();
  const data = await getGeneralSettings();
  const linkClass = resolveLinkClass(data?.headerLinkColor);

  // Header brand er valgfri, så vi sender kun linkClass til public /
  return <Header linkClass={linkClass} />;
}
