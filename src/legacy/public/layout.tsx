"use client";

// src/app/(public)/layout.tsx
import { ReactNode, useState } from "react";
import { getGeneralSettings } from "@/services/settings";
import { getWebsiteHeaderConfig } from "@/services/website";
import type { Brand } from "@/types";
import HeaderClient from "@/components/layout/HeaderClient";
import FooterClient from "@/components/layout/FooterClient";
import { Toaster } from "@/components/ui/toaster";

export default function LegacyPublicLayout({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getGeneralSettings>> | null>(null);
  const [headerConfig, setHeaderConfig] = useState<Awaited<ReturnType<typeof getWebsiteHeaderConfig>> | null>(null);

  useState(() => {
    Promise.all([
      getGeneralSettings(),
      getWebsiteHeaderConfig(),
    ]).then(([settings, headerConfig]) => {
      setSettings(settings);
      setHeaderConfig(headerConfig);
    });
  });

  // Mock brand til public siden – bruger CMS logo hvis tilgængeligt
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

  const footerTheme = settings?.footer ?? {};
  const footerStyle: React.CSSProperties = {
    "--of-footer-bg": footerTheme.bgColor ?? "#0b0b0b",
    "--of-footer-text": footerTheme.textColor ?? "#e5e7eb",
    "--of-footer-link": footerTheme.linkColor ?? "#ffffff",
    "--of-footer-link-hover": footerTheme.linkHoverColor ?? "#d1d5db",
  } as React.CSSProperties;

  return (
    <div className="relative" style={footerStyle}>
      {headerConfig && (
        <HeaderClient brand={publicBrand} settings={settings} config={headerConfig} />
      )}
      
      <main className="flex-1">{children}</main>

      {footerTheme.isVisible !== false && (
        <FooterClient brand={publicBrand} theme={footerTheme} />
      )}
      <Toaster />
    </div>
  );
}