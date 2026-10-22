import type { Metadata, Viewport } from 'next';
import { getBrandBySlug } from '@/lib/data/brand-location';
import { loadMember, loadPortal, portalBase } from './data';
import { ClubNav } from './club-nav';
import { portalPreset } from './brand-preset';
import { homeScreenBrand } from './home-screen';
import { PortalFrame } from './portal-frame';
import './esmeralda-club.css';

export const dynamic = 'force-dynamic';

type Props = { children: React.ReactNode; params: Promise<{ brandSlug: string }> };

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { brandSlug } = await params;
  const [{ program }, base] = await Promise.all([loadPortal(brandSlug), portalBase(brandSlug)]);
  return {
    title: program.name,
    // Personal pages and one-time login links are kept out of search engines.
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
    // "Tilføj til hjemmeskærm" (spec §4.6) with the brand's name and icon.
    manifest: `${base}/manifest.webmanifest`,
    icons: { apple: `${base}/ikon/180` },
    appleWebApp: { capable: true, title: program.name, statusBarStyle: 'default' },
  };
}

export async function generateViewport({ params }: Omit<Props, 'children'>): Promise<Viewport> {
  const brand = await homeScreenBrand((await params).brandSlug);
  return brand ? { themeColor: brand.preset.background } : {};
}

// Customer portal frame inside the brand layout: brand colours, cookie banner
// and footer come from there; this adds the portal header and brand fonts.
export default async function ClubLayout({ children, params }: Props) {
  const { brandSlug } = await params;
  const [{ brand, program }, member, storefrontBrand, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), getBrandBySlug(brandSlug), portalBase(brandSlug)]);
  const preset = portalPreset({ slug: brandSlug, name: brand.brandName, logoUrl: storefrontBrand?.logoUrl });
  return (
    <PortalFrame slug={brandSlug} base={base} preset={preset} brandName={brand.brandName} signedIn={!!member} program={program}
      memberNavigation={member ? <ClubNav base={base} programName={program.name} /> : undefined}>
      {children}
    </PortalFrame>
  );
}
