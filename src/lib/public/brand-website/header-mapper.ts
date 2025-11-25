
'use server';

import type { WebsiteHeaderConfig, BrandWebsiteConfig, GeneralSettings } from '@/types';

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

export function mapToHeaderConfig(
  config: BrandWebsiteConfig,
  settings: GeneralSettings | null
): WebsiteHeaderConfig {
  
  const designSystem = config?.designSystem;
  
  return {
    logoUrl: config.logoUrl || settings?.logoUrl || null,
    navItems: config.headerNavLinks || settings?.headerNavLinks || [],
    isOverlay: true, // This can be made configurable later
    sticky: designSystem?.header?.sticky ?? true,
    heightPx: parseInt(designSystem?.header?.height || '80', 10),
    logoWidthPx: 120, // This can be made configurable later
    topBg: {
      h: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/hsl\((\d+),/)?.[1] || '0', 10)
        : 0,
      s: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/, (\d+)%?/)?.[1] || '0', 10)
        : 0,
      l: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/, \d+%?, (\d+)%?/)?.[1] || '100', 10)
        : 100,
      opacity: designSystem?.header?.transparencyPercent ?? 0,
    },
    scrolledBg: {
      h: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/hsl\((\d+),/)?.[1] || '210', 10)
        : 210,
      s: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/, (\d+)%?/)?.[1] || '100', 10)
        : 100,
      l: designSystem?.colors?.headerBackground
        ? parseInt(designSystem.colors.headerBackground.match(/, \d+%?, (\d+)%?/)?.[1] || '95', 10)
        : 95,
      opacity: designSystem?.header?.transparencyPercent !== undefined ? (100 - designSystem.header.transparencyPercent) : 98,
    },
    linkClass: resolveLinkClass(designSystem?.typography?.linkColor), // Placeholder for actual config
  };
}
