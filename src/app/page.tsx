
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import LegacyPublicLayout from "@/legacy/public/layout";
import LegacyPublicPage from "@/legacy/public/page";
import { getGeneralSettings } from "@/services/settings";
import { getWebsiteHeaderConfig } from "@/services/website";
import type { Brand } from "@/types";

export default async function Home() {
  try {
    const [settings, headerConfig] = await Promise.all([
      getGeneralSettings(),
      getWebsiteHeaderConfig(),
    ]);

    const publicBrand: Brand = {
      id: "public-page-brand",
      name: settings?.websiteTitle || "OrderFly",
      slug: "",
      logoUrl: settings?.logoUrl || "/orderfly-logo-dark.svg",
      companyName: "",
      ownerId: "",
      status: "active",
      street: "",
      zipCode: "",
      city: "",
      country: "",
      currency: "",
      companyRegNo: "",
      foodCategories: [],
      locationsCount: 0,
    };

    return (
      <LegacyPublicLayout brand={publicBrand} settings={settings} headerConfig={headerConfig}>
        <LegacyPublicPage settings={settings} />
      </LegacyPublicLayout>
    );
  } catch (e: any) {
    console.error("[OF-521] Home render failed:", e?.message || e, e?.stack || "");
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Der opstod en fejl</h1>
        <p className="text-muted-foreground mt-2">
          Siden kunne ikke rendere. Tjek server logs for [OF-521] for detaljer.
        </p>
      </main>
    );
  }
}
