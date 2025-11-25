// This file is now free of 'use server' and can be safely imported anywhere.

import type { GeneralSettings, NavLink } from '@/types/settings';
import type { BrandWebsiteConfig } from "@/lib/types/brandWebsite";

export function resolveLinkClass(input?: string): string {
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

export const VIRTUAL_CONFIG: BrandWebsiteConfig = {
  active: false,
  template: 'template-1',
  domains: [],
  defaultLocationId: null,
  faviconUrl: '/favicon.ico', // Default fallback
  designSystem: {},
  seo: {},
  social: {},
  tracking: {},
  legal: {},
  updatedAt: null,
};
