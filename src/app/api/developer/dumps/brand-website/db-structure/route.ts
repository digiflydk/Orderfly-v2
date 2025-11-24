
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const body = JSON.stringify(
    {
      module: 'brand-website',
      collections: {
        'brands/{brandId}/website': {
          config: {
            type: 'document',
            description:
              'Brand website global configuration (design system, SEO, social, tracking, legal, domains).',
          },
          home: {
            type: 'document',
            description: 'Homepage content for the brand website (hero, tiles, campaign banner, footer CTA, etc.).',
          },
          'pages/{slug}': {
            type: 'document',
            description:
              'Custom content pages for the brand website (about, catering, FAQ, terms, etc.).',
          },
          menuSettings: {
            type: 'document',
            description:
              'Configuration for the public menu page layout and behavior.',
          },
        },
        'brands/{brandId}/categories': {
          type: 'collection',
          description: 'Menu categories used by the public menu API.',
        },
        'brands/{brandId}/menu': {
          type: 'collection',
          description: 'Menu items used by the public menu API.',
        },
        'brands/{brandId}/locations/{locationId}': {
            type: 'document',
            description: 'Location data used by the public locations API (opening hours, address, ordering links).',
        },
        'auditLogs/{autoId}': {
            type: 'document',
            description: 'Audit log entries for CMS actions in the brand-website module.',
        },
        'dadmin/developer/logs/{autoId}': {
            type: 'document',
            description: 'Performance and error logs for public and CMS brand-website APIs.',
        }
      },
    },
    null,
    2
  );

  const filename = 'db-structure-dump.json';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
