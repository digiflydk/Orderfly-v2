'use server';

import { unstable_noStore as noStore } from 'next/cache';
import type { WebsiteHeaderConfig } from "@/types/website";
import { getGeneralSettings } from './settings';

// Map CMS-valg (fx "Black") til Tailwind-klasser
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

export async function getWebsiteHeaderConfig(): Promise<WebsiteHeaderConfig> {
  // Undgå stale data efter CMS-gem
  noStore();

  const data = await getGeneralSettings();

  return {
    isOverlay: true,
    sticky: data?.headerIsSticky ?? true,
    heightPx: data?.headerHeight ?? 80,
    logoWidthPx: data?.headerLogoWidth ?? 120,
    topBg: {
      h: data?.headerInitialBackgroundColor?.h ?? 0,
      s: data?.headerInitialBackgroundColor?.s ?? 0,
      l: data?.headerInitialBackgroundColor?.l ?? 100,
      opacity: data?.headerInitialBackgroundOpacity ?? 0,
    },
    scrolledBg: {
      h: data?.headerScrolledBackgroundColor?.h ?? 210,
      s: data?.headerScrolledBackgroundColor?.s ?? 100,
      l: data?.headerScrolledBackgroundColor?.l ?? 95,
      opacity: data?.headerScrolledBackgroundOpacity ?? 98,
    },
    linkClass: resolveLinkClass(data?.headerLinkColor),
  };
}
