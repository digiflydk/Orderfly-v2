import type { CookieTexts } from '@/types';
export const APP_VERSION = "1.0.59";

export const defaultTexts: Omit<CookieTexts, 'id' | 'last_updated'> = {
    consent_version: APP_VERSION,
    language: "en",
    shared_scope: "orderfly",
    banner_title: "We use cookies",
    banner_description: "We use cookies to improve your experience. By clicking 'Accept All', you agree to our use of cookies.",
    accept_all_button: "Accept All",
    customize_button: "Customize",
    modal_title: "Tilpas Indstillingerne For Samtykke",
    modal_description: "We use cookies to help you navigate efficiently and perform certain functions. You will find detailed information about all cookies under each consent category below.",
    save_preferences_button: "Gem mine indstillinger",
    modal_accept_all_button: "Accepter alle",
    categories: {
        necessary: { title: "Nødvendig", description: "Necessary cookies are required to enable the basic features of this site." },
        functional: { title: "Funktionel", description: "Functional cookies help to perform certain functionalities like sharing the content of the website on social media platforms." },
        analytics: { title: "Analytics", description: "Analytical cookies are used to understand how visitors interact with the website." },
        statistics: { title: "Statistics", description: "Statistics cookies are used to understand how visitors interact with the website." },
        performance: { title: "Præstation", description: "Performance cookies are used to understand and analyze the key performance indexes of the website which helps in delivering a better user experience for the visitors." },
        marketing: { title: "Marketing", description: "Marketing cookies are used to track visitors across websites to display relevant ads."}
    }
};


// Only public display strings are copied. Unknown database fields stay server-side.
export function mergeCookieTexts(raw: Partial<CookieTexts>) {
  const out = { ...defaultTexts, categories: { ...defaultTexts.categories } };
  for (const key of Object.keys(defaultTexts)) {
    const value = (raw as any)[key];
    if (key !== 'categories' && typeof value === 'string') (out as any)[key] = value;
  }
  for (const key of Object.keys(defaultTexts.categories)) {
    const value = (raw.categories as any)?.[key], fallback = (defaultTexts.categories as any)[key];
    (out.categories as any)[key] = { title: typeof value?.title === 'string' ? value.title : fallback.title,
      description: typeof value?.description === 'string' ? value.description : fallback.description };
  }
  return out;
}
