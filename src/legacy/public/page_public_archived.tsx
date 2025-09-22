
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

export default async function PublicHomePage() {
  const settings = await getGeneralSettings();

  // Sikre defaults, samt filtrér ukendte nøgler fra CMS
  const sectionOrder: SectionKey[] = (settings?.homePageSectionOrder as SectionKey[] | undefined)
    ?.filter((k): k is SectionKey => DEFAULT_ORDER.includes(k))
    ?? DEFAULT_ORDER;

  const visibility = settings?.sectionVisibility ?? {};

  const sections: Partial<Record<SectionKey, React.ReactNode>> = {
    feature: visibility.feature !== false ? <FeatureSection settings={settings} /> : null,
    services: visibility.services !== false ? <ServicesSection settings={settings} /> : null,
    aiProject: visibility.aiProject !== false ? <AiProjectSection settings={settings} /> : null,
    cases: visibility.cases !== false ? <CasesSection settings={settings} /> : null,
    about: visibility.about !== false ? <AboutSection settings={settings} /> : null,
    customers: visibility.customers !== false ? <CustomersSection settings={settings} /> : null,
    contact: visibility.contact !== false ? <ContactSection settings={settings} /> : null,
  };

  return (
    <Suspense fallback={<div className="mx-auto max-w-[1140px] px-4 py-12">Loading page...</div>}>
      <>
        {/* Hero er altid først */}
        <HeroSection settings={settings} />

        {/* Resten styres af CMS-ordre + visibility */}
        {sectionOrder.map((key) => {
          const node = sections[key] ?? null;
          if (!node) return null;
          return <div key={key}>{node}</div>;
        })}
      </>
    </Suspense>
  );
}
