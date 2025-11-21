
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const dbStructure = {
    "module": "brand-website",
    "collections": {
      "brands/{brandId}/website": {
        "config": {
          "type": "document",
          "description": "Brand website global configuration (design, SEO, social, tracking, legal)"
        },
        "home": {
          "type": "document",
          "description": "Homepage content for the brand website"
        },
        "pages/{slug}": {
          "type": "document",
          "description": "Custom pages for the brand website (about, catering, etc.)"
        },
        "menuSettings": {
          "type": "document",
          "description": "Configuration for the public menu page layout"
        }
      }
    }
  };

  const body = JSON.stringify(dbStructure, null, 2);
  const filename = "db-structure-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
