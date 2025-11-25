

import { resolveLinkClass } from '@/lib/brand-website/utils/public-config-helpers';
import type { GeneralSettings, Brand } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';

export function getHeaderConfig(
  settings: GeneralSettings | null,
  brand: Brand | null
): WebsiteHeaderConfig {
  
  const headerSettings = settings?.header;
  
  return {
    isOverlay: true,
    sticky: headerSettings?.isSticky ?? true,
    heightPx: headerSettings?.height ?? 80,
    logoWidthPx: headerSettings?.logoWidth ?? 120,
    topBg: {
      h: headerSettings?.initialBackgroundColor?.h ?? 0,
      s: headerSettings?.initialBackgroundColor?.s ?? 0,
      l: headerSettings?.initialBackgroundColor?.l ?? 100,
      opacity: headerSettings?.initialBackgroundOpacity ?? 0,
    },
    scrolledBg: {
      h: headerSettings?.scrolledBackgroundColor?.h ?? 210,
      s: headerSettings?.scrolledBackgroundColor?.s ?? 100,
      l: headerSettings?.scrolledBackgroundColor?.l ?? 95,
      opacity: headerSettings?.scrolledBackgroundOpacity ?? 98,
    },
    linkClass: resolveLinkClass(headerSettings?.linkColor),
    logoUrl: settings?.logoUrl || brand?.logoUrl || null,
  };
}
