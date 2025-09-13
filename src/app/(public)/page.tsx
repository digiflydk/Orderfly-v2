
import HeroSection from "@/components/sections/hero";
import FeatureSection from "@/components/sections/feature";
import ServicesSection from "@/components/sections/services";
import AiProjectSection from "@/components/sections/ai-project";
import CasesSection from "@/components/sections/cases";
import AboutSection from "@/components/sections/about";
import CustomersSection from "@/components/sections/customers";
import ContactSection from "@/components/sections/contact";
import { Suspense } from "react";
import { getGeneralSettings } from "@/services/settings";


export default async function PublicHomePage() {
    const settings = await getGeneralSettings();

    const sectionOrder = settings?.homePageSectionOrder || ['feature', 'services', 'aiProject', 'cases', 'about', 'customers', 'contact'];
    const visibility = settings?.sectionVisibility || {};
    
    const sections: Record<string, React.ReactNode> = {
        feature: visibility.feature !== false ? <FeatureSection settings={settings} /> : null,
        services: visibility.services !== false ? <ServicesSection settings={settings} /> : null,
        aiProject: visibility.aiProject !== false ? <AiProjectSection settings={settings} /> : null,
        cases: visibility.cases !== false ? <CasesSection settings={settings} /> : null,
        about: visibility.about !== false ? <AboutSection settings={settings} /> : null,
        customers: visibility.customers !== false ? <CustomersSection settings={settings} /> : null,
        contact: visibility.contact !== false ? <ContactSection settings={settings} /> : null,
    };
    
    return (
       <Suspense fallback={<div>Loading page...</div>}>
            <>
                <HeroSection settings={settings} />
                {sectionOrder.map(key => (
                    <div key={key}>{sections[key]}</div>
                ))}
            </>
       </Suspense>
    );
}
