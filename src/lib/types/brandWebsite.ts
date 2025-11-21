
export interface BrandWebsiteConfig {
  active: boolean;
  template: string;
  domains: string[];
  defaultLocationId: string | null;
  designSystem: Record<string, any>;
  seo: Record<string, any>;
  social: Record<string, any>;
  tracking: Record<string, any>;
  legal: Record<string, any>;
  updatedAt: any; // TODO: replace with shared Timestamp type if available
}

export interface BrandWebsiteHome {
  hero: any[];
  promoTiles: any[];
  campaignBanner: any | null;
  menuPreview: any[];
  footerCta: any | null;
  updatedAt: any;
}

export interface BrandWebsitePage {
  slug: string;
  title: string;
  contentType: string;
  content: Record<string, any>;
  cta?: Record<string, any> | null;
  seo: Record<string, any>;
  updatedAt: any;
}

export interface BrandWebsiteMenuSettings {
  menuHero: Record<string, any>;
  gridColumns: number; // 2, 3, or 4
  showPrice: boolean;
  showDescription: boolean;
  stickyCategories: boolean;
  updatedAt: any;
}
