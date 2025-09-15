// src/app/page.tsx
export const dynamic = 'force-dynamic';

import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { getGeneralSettings } from '@/services/settings';
import { getWebsiteHeaderConfig } from '@/services/website';
import type { Brand } from '@/types';

export default async function HomePage() {
  // Hent CMS data
  const [settings, headerCfg] = await Promise.all([
    getGeneralSettings(),
    getWebsiteHeaderConfig(),
  ]);

  // Byg et "brand" til public forsiden, så Header kan vise logo fra CMS
  const publicBrand: Brand = {
    id: 'public',
    name: settings?.websiteTitle || 'OrderFly',
    slug: '',
    logoUrl: settings?.logoUrl || '/orderfly-logo-dark.svg',
    companyName: '',
    ownerId: '',
    status: 'active',
    street: '',
    zipCode: '',
    city: '',
    country: '',
    currency: '',
    companyRegNo: '',
    foodCategories: [],
    locationsCount: 0,
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7fd]">
      {/* VIGTIGT: giv både brand (for logo) og linkClass (for link-farver) fra CMS */}
      <Header brand={publicBrand} linkClass={headerCfg.linkClass} />

      <main className="flex-1">
        <section className="mx-auto max-w-[1140px] px-4 py-12">
          <h1 className="text-4xl font-bold">Alt-i-en salgsplatform</h1>
          <p className="mt-3 text-lg text-neutral-600">
            Bygget til Take Away &amp; Horeca.
          </p>
        </section>
      </main>

      <Footer
        brand={publicBrand}
        version="Version 1.0.96 • OF-402"
      />
    </div>
  );
}
