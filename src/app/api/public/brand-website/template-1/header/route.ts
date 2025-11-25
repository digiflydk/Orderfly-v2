
'use server';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getTemplate1HeaderPropsForBrandSlug } from '@/lib/public/brand-website/template-1/header-mapper';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get('brandSlug');

  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: 'Missing brandSlug parameter' }, { status: 400 });
  }

  const props = await getTemplate1HeaderPropsForBrandSlug(brandSlug);

  if (!props) {
    return NextResponse.json({ ok: false, error: 'Brand not found or website not configured' }, { status: 404 });
  }

  return NextResponse.json(props);
}
