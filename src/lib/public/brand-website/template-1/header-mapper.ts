'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { Brand } from '@/types';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import type { Template1HeaderProps } from '@/components/public/brand-website/template-1/Header';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

// --- Pure Mapping Function ---
function buildTemplate1HeaderProps(params: {
  brand: Brand;
  config: BrandWebsiteConfig;
}): Template1HeaderProps {
  const { brand, config } = params;

  // Use config nav links if available, otherwise default
  const navItems =
    config.headerNavLinks && config.headerNavLinks.length > 0
      ? config.headerNavLinks
      : [
          { label: 'Menu', href: '#menu' },
          { label: 'About', href: '#about' },
          { label: 'Contact', href: '#contact' },
        ];

  const orderHref = `/${brand.slug}/order`;

  return {
    logoUrl: brand.logoUrl || null,
    navItems,
    orderHref,
  };
}


// --- Data Loading Helper ---
export async function getTemplate1HeaderPropsForBrandSlug(
  brandSlug: string
): Promise<Template1HeaderProps | null> {
  const start = Date.now();
  const action = 'template1-header';
  const path = `virtual:/template1/header/by-brandSlug`;
  let brandId: string | undefined;

  try {
    const db = getAdminDb();

    // 1. Find brand by slug
    const brandQuery = db.collection('brands').where('slug', '==', brandSlug).limit(1);
    const brandSnap = await brandQuery.get();
    if (brandSnap.empty) {
      return null;
    }
    const brand = { id: brandSnap.docs[0].id, ...brandSnap.docs[0].data() } as Brand;
    brandId = brand.id;

    // 2. Fetch website config for the brand
    const configPath = `brands/${brandId}/website/config`;
    const configDoc = await db.doc(configPath).get();
    
    let config: BrandWebsiteConfig = {
      active: false,
      template: 'template-1',
      domains: [],
      defaultLocationId: null,
      headerNavLinks: [],
      updatedAt: null,
    };

    if (configDoc.exists) {
        const data = configDoc.data();
        // Simple merge, more complex validation could be added
        config = { ...config, ...data };
    }

    // 3. Build props
    const headerProps = buildTemplate1HeaderProps({ brand, config });
    
    await logBrandWebsiteApiCall({ layer: 'public', action, brandId, status: 'success', durationMs: Date.now() - start, path });
    return headerProps;

  } catch (error: any) {
    await logBrandWebsiteApiCall({
      layer: 'public',
      action,
      brandId,
      status: 'error',
      durationMs: Date.now() - start,
      path,
      errorMessage: error?.message ?? 'Unknown error',
    });
    console.error(`[HeaderMapper] Failed for brandSlug "${brandSlug}":`, error);
    return null;
  }
}
