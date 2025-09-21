"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGeneralSettings } from "@/services/settings";
import { getWebsiteHeaderConfig } from "@/services/website";
import type { Brand } from "@/types";
import HeaderClient from "@/components/layout/HeaderClient";
import FooterClient from "@/components/layout/FooterClient";
import { PublicLayoutClient } from "@/app/(public)/PublicLayoutClient";

// This is the correct, stable version of the component.
// It wraps the main content and uses a client component to manage its children.
export default function LegacyPublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getGeneralSettings>> | null>(null);
  const [headerConfig, setHeaderConfig] = useState<Awaited<ReturnType<typeof getWebsiteHeaderConfig>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [s, h] = await Promise.all([
        getGeneralSettings(),
        getWebsiteHeaderConfig(),
      ]);
      setSettings(s);
      setHeaderConfig(h);
      setIsLoading(false);
    }
    fetchData();
  }, []);

  // Mock brand for the public homepage – uses CMS logo if available
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

  if (isLoading || !headerConfig) {
    return <div>Loading...</div>;
  }
  
  return (
    <PublicLayoutClient brand={publicBrand} settings={settings} headerConfig={headerConfig}>
      {children}
    </PublicLayoutClient>
  );
}