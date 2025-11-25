// src/app/api/public/brand-website/template-1/header/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getTemplate1HeaderPropsForBrandSlug } from '@/lib/public/brand-website/template-1/header-mapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get('brandSlug');

  if (!brandSlug) {
    return NextResponse.json(
      { ok: false, error: 'Missing brandSlug parameter' },
      { status: 400 }
    );
  }

  const headerProps = await getTemplate1HeaderPropsForBrandSlug(brandSlug);

  if (!headerProps) {
    return NextResponse.json(
      { ok: false, error: `Brand not found or configured for slug: ${brandSlug}` },
      { status: 404 }
    );
  }

  return NextResponse.json(headerProps);
}
