
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

export type BrandWebsitePageLayoutType = 'rich-text-left-image-right';

export interface BrandWebsitePageCta {
  label: string;
  href: string;
}

export interface BrandWebsitePage {
  slug: string;
  title: string;
  subtitle?: string;
  layout: BrandWebsitePageLayoutType;
  body: string;
  imageUrl?: string;
  cta?: BrandWebsitePageCta | null;
  seo?: {
    title?: string;
    description?: string;
    ogImageUrl?: string;
    canonicalUrl?: string;
    index?: boolean;
  };
  sortOrder?: number;
  isPublished: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface BrandWebsitePageSummary {
  slug: string;
  title: string;
  isPublished: boolean;
  sortOrder?: number;
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
