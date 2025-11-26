
'use server';

import { getPublicBrandWebsiteConfig } from "../public-config-api";
import { buildTemplate1HeaderProps } from "./header-mapper";
import { logBrandWebsiteApiCall } from "@/lib/developer/brand-website-api-logger";

export async function getTemplate1HeaderPropsByBrandSlug(brandSlug: string) {
  const start = Date.now();
  const action = 'getTemplate1HeaderPropsByBrandSlug';
  try {
    const config = await getPublicBrandWebsiteConfig(brandSlug);
    const headerProps = buildTemplate1HeaderProps(config);

    await logBrandWebsiteApiCall({
        layer: 'public', action, brandId: brandSlug, status: 'success', durationMs: Date.now() - start
    });

    return headerProps;
  } catch (error: any) {
     await logBrandWebsiteApiCall({
        layer: 'public', action, brandId: brandSlug, status: 'error', durationMs: Date.now() - start, errorMessage: error?.message ?? 'Unknown error'
    });
    throw error;
  }
}
