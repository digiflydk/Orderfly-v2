
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const cmsApiEndpoints = {
    config: {
      saveBrandWebsiteConfig: 'Saves domain and status settings to brands/{brandId}/website/config.'
    },
    design: {
      saveBrandWebsiteDesignSystem: 'Saves colors and typography to brands/{brandId}/website/design.'
    },
    seo: {
      saveBrandWebsiteSeo: 'Saves SEO metadata to brands/{brandId}/website/seo.'
    },
    home: {
      saveBrandWebsiteHome: 'Saves all homepage section content to brands/{brandId}/website/home.'
    },
    pages: {
      listBrandWebsitePages: 'Lists all custom static pages for a brand.',
      getBrandWebsitePage: 'Gets a single custom page by slug.',
      createOrUpdateBrandWebsitePage: 'Creates or updates a custom page.',
      deleteBrandWebsitePage: 'Deletes a custom page.'
    },
    menu: {
      saveBrandWebsiteMenuSettings: 'Saves menu display preferences.'
    }
  };

  const body = JSON.stringify({ endpoints: cmsApiEndpoints }, null, 2);
  const filename = "brand-website-cms-api-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
