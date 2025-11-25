'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { Brand, NavLink } from '@/types';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import type { Template1HeaderProps } from '@/components/public/brand-website/template-1/Header';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

// Default navigation items if none are defined in the config
const defaultNavItems: NavLink[] = [
  { label: 'Menu', href: '#menu' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

/**
 * Maps Brand and Config data to the props required by the Template 1 Header component.
 */
export function buildTemplate1HeaderProps(params: {
  brand: Brand;
  config: Partial<BrandWebsiteConfig>;
}): Template1HeaderProps {
  const { brand, config } = params;
  
  return {
    logoUrl: brand.logoUrl || null,
    logoAlt: brand.name,
    navItems: config.headerNavLinks && config.headerNavLinks.length > 0 ? config.headerNavLinks : defaultNavItems,
    orderHref: `/${brand.slug}/order`,
  };
}


/**
 * Fetches the necessary data for a given brand and returns the props for the Template 1 Header.
 */
export async function getTemplate1HeaderPropsForBrandSlug(brandSlug: string): Promise<(Template1HeaderProps & { designSystem: Partial<BrandWebsiteConfig['designSystem']> }) | null> {
    const start = Date.now();
    const action = 'getTemplate1HeaderPropsForBrandSlug';
    let brand: Brand | null = null;
    try {
        const db = getAdminDb();
        const brandQuery = await db.collection('brands').where('slug', '==', brandSlug).limit(1).get();
        if (brandQuery.empty) {
            throw new Error(`Brand with slug "${brandSlug}" not found.`);
        }
        brand = { id: brandQuery.docs[0].id, ...brandQuery.docs[0].data() } as Brand;

        const configRef = db.doc(`/brands/${brand.id}/website/config`);
        const configSnap = await configRef.get();
        const config: Partial<BrandWebsiteConfig> = configSnap.exists() ? configSnap.data() as Partial<BrandWebsiteConfig> : {};
        
        const headerProps = buildTemplate1HeaderProps({ brand, config });
        
        const result = {
            ...headerProps,
            designSystem: config.designSystem || {},
        };
        
        await logBrandWebsiteApiCall({
            layer: 'public', action, brandId: brand.id, status: 'success', durationMs: Date.now() - start, path: `virtual:/template1/header/by-brandSlug`
        });
        
        return result;

    } catch (error: any) {
        await logBrandWebsiteApiCall({
            layer: 'public', action, brandId: brand?.id || null, status: 'error', durationMs: Date.now() - start, path: `virtual:/template1/header/by-brandSlug`, errorMessage: error?.message ?? 'Unknown error'
        });
        return null;
    }
}
