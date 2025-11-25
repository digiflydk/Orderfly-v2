'use server';

import { NextResponse } from 'next/server';
import { getTemplate1HeaderPropsForBrandSlug } from '@/lib/public/brand-website/template-1/header-mapper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brandSlug = searchParams.get('brandSlug');

  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: 'brandSlug parameter is required.' }, { status: 400 });
  }

  const props = await getTemplate1HeaderPropsForBrandSlug(brandSlug);

  if (!props) {
    return NextResponse.json({ ok: false, error: `Could not retrieve header data for brand '${brandSlug}'.` }, { status: 404 });
  }

  return NextResponse.json(props);
}
