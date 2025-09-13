
import { PublicLayoutClient } from './PublicLayoutClient';
import { getGeneralSettings } from "@/services/settings";
import { getWebsiteHeaderConfig } from '@/services/website';
import type { Brand, GeneralSettings } from "@/types";
import HeaderClient from '@/components/layout/HeaderClient';
import FooterClient from '@/components/layout/FooterClient';
import { cn } from '@/lib/utils';
import { Footer } from '@/components/layout/footer';


export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
    const [settings, headerConfig] = await Promise.all([
        getGeneralSettings(),
        getWebsiteHeaderConfig(),
    ]);
  
  const mockBrand: Brand = {
    id: 'public-page-brand',
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
  }

  const footerTheme = settings?.footer ?? {};

  const footerStyle: React.CSSProperties = {
    '--of-footer-bg': footerTheme.bgColor ?? '#0b0b0b',
    '--of-footer-text': footerTheme.textColor ?? '#e5e7eb',
    '--of-footer-link': footerTheme.linkColor ?? '#ffffff',
    '--of-footer-link-hover': footerTheme.linkHoverColor ?? '#d1d5db',
  } as React.CSSProperties;


  return (
    <div className="relative" style={footerStyle}>
      <HeaderClient brand={mockBrand} settings={settings} config={headerConfig} />
      <main className="flex-1">{children}</main>
      {footerTheme.isVisible !== false && (
          <FooterClient brand={mockBrand} theme={footerTheme} />
      )}
    </div>
  );
}
