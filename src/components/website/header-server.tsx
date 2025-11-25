// src/components/website/header-server.tsx
'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { Header } from '@/components/layout/header';
import { getGeneralSettings } from '@/services/settings';
import { resolveLinkClass } from '@/lib/public/brand-website/public-config-helpers';

export default async function HeaderServer() {
  noStore();
  const data = await getGeneralSettings();
  const linkClass = resolveLinkClass(data?.headerLinkColor);

  return <Header linkClass={linkClass} />;
}
