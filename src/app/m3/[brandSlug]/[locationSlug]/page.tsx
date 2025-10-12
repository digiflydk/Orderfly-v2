import { notFound } from "next/navigation";
import { isM3Enabled } from "@/lib/feature-flags";
import { mockMenu } from "@/app/m3/_data/mock";
import MenuList from "@/app/m3/_components/MenuList";

type Props = {
  params: Promise<{ brandSlug: string; locationSlug: string }>;
};

export const runtime = "nodejs";

export default async function M3LocationPage({ params }: Props) {
  const { brandSlug, locationSlug } = await params;

  if (!isM3Enabled()) {
    notFound();
  }

  if (brandSlug !== mockMenu.brandSlug || locationSlug !== mockMenu.locationSlug) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">M3 (Preview)</h1>
        <p className="text-sm text-neutral-600">
          {brandSlug} / {locationSlug}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Menu (mock)</h2>
        <MenuList items={mockMenu.items} />
      </section>
    </main>
  );
}
