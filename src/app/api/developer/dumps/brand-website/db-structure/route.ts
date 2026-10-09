import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
export async function GET() {
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  return Response.json({module: 'brand-website', version: 'standard-takeaway',
    activePaths: ['brands/{brandId}', 'locations/{locationId}', 'products/{productId}', 'categories/{categoryId}'],
    compatibility: {path: 'brands/{brandId}/website/config', fields: ['social', 'legal'], mode: 'read-only'},
    retainedLegacyPaths: ['brands/{brandId}/website/home', 'brands/{brandId}/website/menuSettings', 'brands/{brandId}/websitePages/{slug}'],
    note: 'Schema metadata only. This response contains no production records.'},
    {headers: {'Content-Disposition': 'attachment; filename="brand-website-metadata.json"'}});
}
