

import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { notFound } from "next/navigation";

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandSlug: string };
}) {
  const brand = await getBrandBySlug(params.brandSlug);

  if (!brand) {
    notFound();
  }

  // The header is now handled by the parent BrandLayoutClient,
  // so this layout just passes children through.
  return (
    <div className="flex flex-col min-h-screen">
      <main className="w-full mx-auto flex-1">
        {children}
      </main>
    </div>
  );
}
