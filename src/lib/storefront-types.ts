export type StorefrontLinks = {
  social: Partial<Record<'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x', string>>;
  legal: Partial<Record<'customCookiePolicy' | 'customPrivacyPolicy' | 'customTerms', string>>;
};
export type StorefrontOverview = {
  id: string; name: string; brandStatus: string; href: string | null;
  canEditBrand: boolean;
  locations: Array<{id: string; name: string; href: string | null; active: boolean}>;
};
