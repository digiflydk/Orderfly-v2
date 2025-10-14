import Link from "next/link";
import { isM3Enabled } from "@/lib/feature-flags";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import { Header } from "@/components/layout/header";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";

export const runtime = "nodejs";

export default async function M3IndexPage() {
  if (!isM3Enabled()) {
    return (
      <main className="space-y-2 p-6 text-center">
        <h1 className="text-2xl font-semibold text-red-600">M3 disabled</h1>
        <p>
          Set <code>NEXT_PUBLIC_M3_PREVIEW=true</code> in <code>.env.local</code> to
          activate the preview.
        </p>
      </main>
    );
  }

  // Fetch a mock brand to pass to the header for styling purposes
  const brand = await getBrandBySlug('brand-gourmet');

  return (
    <main>
      <Header brand={brand} settings={null} />
      <Hero />
      <CTADeck />
      <MenuGrid />
      <PromoBanner />
      <FooterCTA />
    </main>
  );
}
