import { isM3Enabled } from "@/lib/feature-flags";
import { MobileHeader } from "./_components/MobileHeader";
import { MobileHero } from "./_components/MobileHero";
import { MobileCardGrid } from "./_components/MobileCardGrid";
import StickyOrderChoice from "./_components/StickyOrderChoice";

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

  return (
    <main className="bg-[#FFF7EF] min-h-dvh">
      <MobileHeader />
      <MobileHero />
      <div className="px-3 py-4">
        <MobileCardGrid />
      </div>
      <StickyOrderChoice />
    </main>
  );
}
