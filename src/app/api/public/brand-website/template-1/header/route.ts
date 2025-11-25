
import { NextResponse } from 'next/server';
import { getTemplate1HeaderPropsByBrandSlug } from '@/lib/public/brand-website/template-1/header-actions';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get('brandSlug');

  if (!brandSlug) {
    return new Response('brandSlug is required', { status: 400 });
  }

  try {
    const props = await getTemplate1HeaderPropsByBrandSlug(brandSlug);
    return NextResponse.json(props);
  } catch (error: any) {
    return new Response(`Error fetching header props: ${error.message}`, { status: 500 });
  }
}
