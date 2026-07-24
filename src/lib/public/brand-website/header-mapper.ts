

import { resolveLinkClass } from '@/lib/brand-website/utils/public-config-helpers';
import type { GeneralSettings, Brand } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';

export function getHeaderConfig(
  settings: GeneralSettings | null,
  brand: Brand | null
): WebsiteHeaderConfig {
  
  return {
    isOverlay: true,
    sticky: settings?.headerIsSticky ?? true,
    heightPx: settings?.headerHeight ?? 80,
    logoWidthPx: settings?.headerLogoWidth ?? 120,
    topBg: {
      h: settings?.headerInitialBackgroundColor?.h ?? 0,
      s: settings?.headerInitialBackgroundColor?.s ?? 0,
      l: settings?.headerInitialBackgroundColor?.l ?? 100,
      opacity: settings?.headerInitialBackgroundOpacity ?? 0,
    },
    scrolledBg: {
      h: settings?.headerScrolledBackgroundColor?.h ?? 210,
      s: settings?.headerScrolledBackgroundColor?.s ?? 100,
      l: settings?.headerScrolledBackgroundColor?.l ?? 95,
      opacity: settings?.headerScrolledBackgroundOpacity ?? 98,
    },
    linkClass: resolveLinkClass(settings?.headerLinkColor),
    logoUrl: settings?.logoUrl || brand?.logoUrl || null,
  };
}
