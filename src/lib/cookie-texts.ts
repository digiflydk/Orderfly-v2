import type { CookieTexts } from '@/types';
export const COOKIE_LANGUAGE_PATTERN = /^(?:[a-z]{2}(?:-[a-z]{2})?|[a-z]{3})$/i;
export const APP_VERSION = "1.0.59";

type PublicCookieTexts = Omit<CookieTexts, 'id' | 'last_updated'>;
const englishTexts: PublicCookieTexts = {
  consent_version: APP_VERSION, language: 'en', shared_scope: 'orderfly',
  banner_title: 'We use cookies',
  banner_description: 'We use necessary cookies to run the webshop. You can choose whether to allow optional cookies.',
  accept_all_button: 'Accept all', customize_button: 'Customize',
  modal_title: 'Cookie preferences', modal_description: 'Choose which optional cookies you allow. You can change your choice later.',
  save_preferences_button: 'Save preferences', modal_accept_all_button: 'Accept all',
  categories: {
    necessary: { title: 'Necessary', description: 'Required for the webshop and checkout to work.' },
    functional: { title: 'Functional', description: 'Remember your preferences and support optional features.' },
    analytics: { title: 'Statistics', description: 'Help us understand how the webshop is used.' },
    statistics: { title: 'Statistics', description: 'Help us understand how the webshop is used.' },
    performance: { title: 'Performance', description: 'Help us measure the performance of the webshop.' },
    marketing: { title: 'Marketing', description: 'Used to measure campaigns and show relevant advertising.' },
  },
};
const danishTexts: PublicCookieTexts = {
  consent_version: APP_VERSION, language: 'da', shared_scope: 'orderfly',
  banner_title: 'Vi bruger cookies',
  banner_description: 'Vi bruger nødvendige cookies til at drive webshoppen. Du vælger selv, om du vil tillade valgfrie cookies.',
  accept_all_button: 'Accepter alle', customize_button: 'Tilpas',
  modal_title: 'Cookieindstillinger', modal_description: 'Vælg, hvilke valgfrie cookies du tillader. Du kan ændre dit valg senere.',
  save_preferences_button: 'Gem mine indstillinger', modal_accept_all_button: 'Accepter alle',
  categories: {
    necessary: { title: 'Nødvendige', description: 'Nødvendige for, at webshoppen og bestillingen fungerer.' },
    functional: { title: 'Funktionelle', description: 'Husker dine præferencer og understøtter valgfrie funktioner.' },
    analytics: { title: 'Statistik', description: 'Hjælper os med at forstå, hvordan webshoppen bruges.' },
    statistics: { title: 'Statistik', description: 'Hjælper os med at forstå, hvordan webshoppen bruges.' },
    performance: { title: 'Ydeevne', description: 'Hjælper os med at måle webshoppens ydeevne.' },
    marketing: { title: 'Marketing', description: 'Bruges til at måle kampagner og vise relevante annoncer.' },
  },
};
export function getDefaultCookieTexts(language = 'da'): PublicCookieTexts {
  return language.toLowerCase().split('-')[0] === 'da' ? danishTexts : englishTexts;
}
export const defaultTexts = danishTexts;

// Only public display strings are copied. Unknown database fields stay server-side.
export function mergeCookieTexts(raw: Partial<CookieTexts>, language = raw.language || 'da') {
  const defaultTexts = getDefaultCookieTexts(language);
  const out = { ...defaultTexts, categories: { ...defaultTexts.categories } };
  for (const key of Object.keys(defaultTexts)) {
    const value = (raw as any)[key];
    if (key !== 'categories' && typeof value === 'string' && value.trim()) (out as any)[key] = value;
  }
  for (const key of Object.keys(defaultTexts.categories)) {
    const value = (raw.categories as any)?.[key], fallback = (defaultTexts.categories as any)[key];
    const legacy = key === 'statistics' ? raw.categories?.analytics : undefined;
    const nonblank = (text: unknown): text is string => typeof text === 'string' && !!text.trim();
    (out.categories as any)[key] = {
      title: nonblank(value?.title) ? value.title : nonblank(legacy?.title) ? legacy.title : fallback.title,
      description: nonblank(value?.description) ? value.description : nonblank(legacy?.description) ? legacy.description : fallback.description,
    };
  }
  return out;
}
