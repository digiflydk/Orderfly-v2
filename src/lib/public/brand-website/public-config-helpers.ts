'use server';

// This file is now obsolete. The logic has been moved to a new helper file
// to avoid "use server" conflicts. See `public-config-helpers.ts`.
// It is kept temporarily to avoid breaking builds that might still reference it,
// but it should be removed in a future cleanup.

import { getGeneralSettings } from '@/services/settings';
import type { WebsiteHeaderConfig } from '@/types/website';

function resolveLinkClass(input?: string): string {
    const v = (input || '').toLowerCase().trim();
    switch (v) {
        case 'black': return 'text-black hover:text-black/70';
        case 'white': return 'text-white hover:text-white/80';
        case 'primary': return 'text-primary hover:text-primary/80';
        case 'secondary': return 'text-secondary hover:text-secondary/80';
        default: return 'text-white hover:text-primary';
    }
}

export async function getPublicBrandWebsiteConfig(brandSlug: string): Promise<WebsiteHeaderConfig | null> {
    const data = await getGeneralSettings(); // This should be adapted to use brand-specific settings
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
