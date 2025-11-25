'use server';

import 'server-only';
import { getPublicBrandWebsiteConfig } from '../public-config-api';
import { buildTemplate1HeaderProps } from './header-mapper';

export async function getTemplate1HeaderPropsByBrandSlug(brandSlug: string) {
  const config = await getPublicBrandWebsiteConfig(brandSlug);
  return buildTemplate1HeaderProps(config);
}
