"use client";
export const dynamic = 'force-dynamic';

import { Suspense } from "react";
import HeroSection from "@/components/sections/hero";
import FeatureSection from "@/components/sections/feature";
import ServicesSection from "@/components/sections/services";
import AiProjectSection from "@/components/sections/ai-project";
import CasesSection from "@/components/sections/cases";
import AboutSection from "@/components/sections/about";
import CustomersSection from "@/components/sections/customers";
import ContactSection from "@/components/sections/contact";
import { getGeneralSettings } from "@/services/settings";

type SectionKey =
  | "feature"
  | "services"
  | "aiProject"
  | "cases"
  | "about"
  | "customers"
  | "contact";

const DEFAULT_ORDER: SectionKey[] = [
  "feature",
  "services",
  "aiProject",
  "cases",
  "about",
  "customers",
  "contact",
];

export default function PublicHomePage() {
  
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1140px] px-4 py-12">Loading page...</div>}>
      <>
        {/* Hero er altid først */}
        <HeroSection settings={null} />

        {/* Resten styres af CMS-ordre + visibility */}
        {DEFAULT_ORDER.map((key) => {
          const sections: Partial<Record<SectionKey, React.ReactNode>> = {
            feature: <FeatureSection settings={null} />,
            services: <ServicesSection settings={null} />,
            aiProject: <AiProjectSection settings={null} />,
            cases: <CasesSection settings={null} />,
            about: <AboutSection settings={null} />,
            customers: <CustomersSection settings={null} />,
            contact: <ContactSection settings={null} />,
          };
          const node = sections[key] ?? null;
          if (!node) return null;
          return <div key={key}>{node}</div>;
        })}
      </>
    </Suspense>
  );
}
