
export type BrandWebsiteConfigFormInput = {
  active: boolean;
  template: string;
  defaultLocationId: string | null;
  domains: string[];
  faviconUrl?: string; // undefined allowed
};
