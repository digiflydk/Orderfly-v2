export const dynamic = 'force-dynamic';

import { getGeneralSettings } from '@/services/settings';
import { getWebsiteHeaderConfig } from '@/services/website';
import type { Brand, GeneralSettings } from '@/types';
import HeaderClient from '@/components/layout/HeaderClient';
import FooterClient from '@/components/layout/FooterClient';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hent CMS-indstillinger + header-konfiguration parallelt
  const [settings, headerConfig] = await Promise.all([
    getGeneralSettings(),
    getWebsiteHeaderConfig(),
  ]);

  // Mock brand til public-site (bruges af Header/Footers)
  const mockBrand: Brand = {
    id: 'public-page-brand',
    name: settings?.websiteTitle || 'OrderFly',
    slug: '',
    logoUrl:
      settings?.logoUrl ||
      '/orderfly-logo-dark.svg' /* fallback-logo fra /public */,
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

  // Footer tema fra CMS (med sikre defaults)
  const footerTheme = (settings as GeneralSettings | undefined)?.footer ?? {};

  const footerStyle: React.CSSProperties = {
    '--of-footer-bg': footerTheme.bgColor ?? '#0b0b0b',
    '--of-footer-text': footerTheme.textColor ?? '#e5e7eb',
    '--of-footer-link': footerTheme.linkColor ?? '#ffffff',
    '--of-footer-link-hover': footerTheme.linkHoverColor ?? '#d1d5db',
  } as React.CSSProperties;

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f7fd]" style={footerStyle}>
      {/* Header med CMS-styret linkClass via headerConfig */}
      <HeaderClient brand={mockBrand} settings={settings} config={headerConfig} />

      <main className="flex-1">{children}</main>

      {/* Skjul footer hvis isVisible === false i CMS */}
      {footerTheme.isVisible !== false && (
        <FooterClient brand={mockBrand} theme={footerTheme} />
      )}
    </div>
  );
}
