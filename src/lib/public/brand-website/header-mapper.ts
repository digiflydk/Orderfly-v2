
'use server';
import type { Brand, GeneralSettings } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';

function resolveLinkClass(input?: string): string {
    // Implement logic to map CMS color names to Tailwind classes
    return 'text-white hover:text-primary';
}

export function mapToHeaderProps(
    brand: Brand, 
    settings: GeneralSettings | null, 
    publicUrl: string
): WebsiteHeaderConfig {
    const config = brand.appearances; // Assuming this is where the design system lives
    const cmsHeader = settings?.header ?? {}; // OF-522-11-20
    const cmsSeo = settings?.seo || {};

    const defaults = {
        isOverlay: true,
        sticky: cmsHeader.isSticky ?? true,
        heightPx: cmsHeader.headerHeight ?? 80,
        logoWidthPx: cmsHeader.headerLogoWidth ?? 120,
        topBg: { 
            h: cmsHeader.headerInitialBackgroundColor?.h ?? 0,
            s: cmsHeader.headerInitialBackgroundColor?.s ?? 0,
            l: cmsHeader.headerInitialBackgroundColor?.l ?? 100,
            opacity: cmsHeader.headerInitialBackgroundOpacity ?? 0
        },
        scrolledBg: {
            h: cmsHeader.headerScrolledBackgroundColor?.h ?? 210,
            s: cmsHeader.headerScrolledBackgroundColor?.s ?? 100,
            l: cmsHeader.headerScrolledBackgroundColor?.l ?? 95,
            opacity: cmsHeader.headerScrolledBackgroundOpacity ?? 98
        },
        linkClass: resolveLinkClass(cmsHeader.headerLinkColor),
        navItems: cmsHeader.headerNavLinks || [],
        logoUrl: brand.logoUrl || settings?.logoUrl || null,
        logoAlt: brand.name,
        faviconUrl: brand.faviconUrl || settings?.faviconUrl || '/favicon.ico',
        title: cmsSeo.defaultTitle || brand.name,
        description: cmsSeo.defaultDescription || '',
        ogImageUrl: cmsSeo.ogImageUrl || null,
        canonicalUrl: cmsSeo.canonicalUrl || publicUrl,
        robotsNoIndex: cmsSeo.index === false, // Note the inversion
    };

    return defaults;
}
