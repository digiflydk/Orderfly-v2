
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Brand } from '@/types';
import type { BrandWebsiteConfig, DesignSystem } from '@/lib/types/brandWebsite';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';
import { type Template1HeaderProps } from '@/components/public/brand-website/template-1/Header';

function buildTemplate1HeaderProps(params: {
  brand: Brand;
  config: BrandWebsiteConfig;
}): Omit<Template1HeaderProps, 'designSystem'> {
  const { brand, config } = params;
  return {
    logoUrl: brand.logoUrl || null,
    navItems: [
      { label: 'Menu', href: '#menu' },
      { label: 'About', href: '#about' },
      { label: 'Contact', href: '#contact' },
    ],
    orderHref: `/${brand.slug || 'order'}`,
  };
}

const VIRTUAL_CONFIG: BrandWebsiteConfig = {
  active: false,
  template: 'template-1',
  domains: [],
  defaultLocationId: null,
  designSystem: {},
  seo: {},
  social: {},
  tracking: {},
  legal: {},
  updatedAt: null,
};

export async function getTemplate1HeaderPropsForBrandSlug(brandSlug: string): Promise<(Omit<Template1HeaderProps, 'children'> & { designSystem: DesignSystem | null }) | null> {
  const start = Date.now();
  const db = getAdminDb();
  let brand: Brand | null = null;
  let brandId: string | null = null;

  try {
    const brandQuery = await db.collection('brands').where('slug', '==', brandSlug).limit(1).get();
    if (brandQuery.empty) return null;
    
    const brandDoc = brandQuery.docs[0];
    brandId = brandDoc.id;
    brand = { id: brandId, ...brandDoc.data() } as Brand;
    
    const configRef = db.doc(`/brands/${brandId}/website/config`);
    const configSnap = await configRef.get();
    
    const configData = configSnap.exists() ? configSnap.data() : {};
    const config = { ...VIRTUAL_CONFIG, ...configData };

    const headerProps = buildTemplate1HeaderProps({ brand, config });
    
    await logBrandWebsiteApiCall({
      layer: 'public',
      action: 'template1-header',
      brandId,
      status: 'success',
      durationMs: Date.now() - start,
      path: `virtual:/template1/header/by-brandSlug?slug=${brandSlug}`,
    });
    
    return { ...headerProps, designSystem: config.designSystem ?? null };

  } catch (error: any) {
    await logBrandWebsiteApiCall({
      layer: 'public',
      action: 'template1-header',
      brandId,
      status: 'error',
      durationMs: Date.now() - start,
      path: `virtual:/template1/header/by-brandSlug?slug=${brandSlug}`,
      errorMessage: error.message,
    });
    return null;
  }
}
