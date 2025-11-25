
'use server';

import { getPublicBrandWebsiteConfig } from '@/lib/public/brand-website/public-config-api';
import type { Brand, NavLink } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';
import { resolveLinkClass } from '@/lib/brand-website/utils/public-config-helpers';

export async function getTemplate1HeaderPropsByBrandSlug(
  slug: string
): Promise<WebsiteHeaderConfig & { navLinks: NavLink[] }> {
  // This is a placeholder for brand resolution logic
  const MOCK_BRAND_MAP: Record<string, { id: string; name: string }> = {
    esmeralda: { id: 'brand-esmeralda', name: 'Esmeralda Pizza' },
    m3pizza: { id: 'brand-m3pizza', name: 'M3Pizza' },
  };

  const brand = MOCK_BRAND_MAP[slug];
  if (!brand) throw new Error('Brand not found');

  const config = await getPublicBrandWebsiteConfig(brand.id);

  const headerSettings = config?.designSystem?.header;
  const navLinks = config?.headerNavLinks || [];

  return {
    isOverlay: true,
    sticky: headerSettings?.sticky ?? true,
    heightPx: headerSettings?.height ? parseInt(headerSettings.height, 10) : 80,
    logoWidthPx: headerSettings?.logoWidth ? parseInt(headerSettings.logoWidth, 10) : 120,
    topBg: {
      h: headerSettings?.transparencyPercent || 0,
      s: 0,
      l: 0,
      opacity: 0, // Placeholder
    },
    scrolledBg: {
      h: 0,
      s: 0,
      l: 100,
      opacity: 95, // Placeholder
    },
    linkClass: resolveLinkClass(headerSettings?.linkColor),
    logoUrl: config.logoUrl || null,
    navLinks: navLinks,
    faviconUrl: config.faviconUrl || '/favicon.ico',
  };
}
