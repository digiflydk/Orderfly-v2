
// This file is now obsolete as the checkout layout is handled by /[brandSlug]/[locationSlug]/checkout/layout.tsx
// However, we keep it to prevent build errors and to handle the redirect logic.
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";

export default async function LegacyCheckoutLayout({
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

  return (
    <div className="flex flex-col min-h-screen">
      <main className="w-full mx-auto flex-1">
        {children}
      </main>
    </div>
  );
}
