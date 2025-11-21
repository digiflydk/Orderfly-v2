
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const dbStructure = {
    "brands/{brandId}/website/config": {
        "description": "Core configuration for the brand's website.",
        "fields": ["primaryDomain", "extraDomains", "status", "templateId"]
    },
    "brands/{brandId}/website/home": {
        "description": "Content for all sections on the homepage.",
        "fields": ["hero", "promoTiles", "banner", "footerCta", "menuPreview"]
    },
    "brands/{brandId}/website/pages": {
        "description": "A collection of custom static pages.",
        "subcollections": {
            "{slug}": {
                "description": "A single page document.",
                "fields": ["title", "contentMarkdown", "seoMeta"]
            }
        }
    },
    "brands/{brandId}/website/menuSettings": {
        "description": "Settings for how the public menu is displayed.",
        "fields": ["displayMode", "featuredCategoryIds"]
    }
  };

  const body = JSON.stringify({ structure: dbStructure }, null, 2);
  const filename = "brand-website-db-structure-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
