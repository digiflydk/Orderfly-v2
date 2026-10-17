import type { Metadata } from 'next';
import { getBrandBySlug } from '@/lib/data/brand-location';
import { loadPortal, portalBase } from './data';
import { portalPreset } from './brand-preset';

export const dynamic = 'force-dynamic';

type Props = { children: React.ReactNode; params: Promise<{ brandSlug: string }> };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { program } = await loadPortal((await params).brandSlug);
  // Personal pages and one-time login links are kept out of search engines.
  return { title: program.name, robots: { index: false, follow: false } };
}

// Customer portal frame inside the brand layout: brand colours, cookie banner
// and footer come from there; this adds the portal header and brand fonts.
export default async function ClubLayout({ children, params }: Props) {
  const { brandSlug } = await params;
  const [{ brand }, storefrontBrand, base] = await Promise.all([loadPortal(brandSlug), getBrandBySlug(brandSlug), portalBase(brandSlug)]);
  const preset = portalPreset({ slug: brandSlug, name: brand.brandName, logoUrl: storefrontBrand?.logoUrl });
  return (
    <div data-loyalty-portal className="mx-auto flex w-full max-w-md flex-col px-4 pb-12 text-base">
      {preset.fontCss && <style>{preset.fontCss}</style>}
      <header className="flex justify-center py-6">
        <a href={base} className="inline-flex min-h-11 items-center">
          {preset.logoUrl
            ? <img src={preset.logoUrl} alt={preset.logoAlt} className="h-16 w-auto max-w-[200px] object-contain" />
            : <span className="text-xl font-semibold">{brand.brandName}</span>}
        </a>
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
