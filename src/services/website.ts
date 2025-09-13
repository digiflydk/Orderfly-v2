
'use server';

import type { WebsiteHeaderConfig } from "@/types/website";
import { getGeneralSettings } from './settings';

// TODO: Erstat mock med rigtig fetch fra Firestore/DB
export async function getWebsiteHeaderConfig(): Promise<WebsiteHeaderConfig> {
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
    linkClass: data?.headerLinkColor ?? "text-white hover:text-primary",
  };
}
