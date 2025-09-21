"use client";
// src/app/(public)/layout.tsx
import { ReactNode, useEffect } from "react";
import { getGeneralSettings } from "@/services/settings";
import { getWebsiteHeaderConfig } from "@/services/website";
import type { Brand } from "@/types";
import HeaderClient from "@/components/layout/HeaderClient";
import FooterClient from "@/components/layout/FooterClient";
import { useRouter } from "next/navigation";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // This is a placeholder for potential client-side logic.
    // The previous implementation had logic that could cause navigation issues.
    // This structure is safer.
  }, [router]);

  const publicBrand: Brand = {
    id: "public-page-brand",
    name: "OrderFly",
    slug: "",
    logoUrl: "/orderfly-logo-dark.svg",
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

  const footerStyle: React.CSSProperties = {
    "--of-footer-bg": "#0b0b0b",
    "--of-footer-text": "#e5e7eb",
    "--of-footer-link": "#ffffff",
    "--of-footer-link-hover": "#d1d5db",
  } as React.CSSProperties;

  return (
    <div className="relative" style={footerStyle}>
      <main className="flex-1">{children}</main>
    </div>
  );
}
