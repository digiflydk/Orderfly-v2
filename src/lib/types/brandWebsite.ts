

export interface NavLink {
    label: string;
    href: string;
}

export interface BrandWebsiteConfig {
  active: boolean;
  template: string;
  domains: string[];
  defaultLocationId: string | null;
  headerNavLinks?: NavLink[];
  updatedAt: any;
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

export type BrandWebsiteMenuGridLayout = 2 | 3 | 4;

export interface BrandWebsiteMenuHero {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface BrandWebsiteMenuSettings {
  hero: BrandWebsiteMenuHero | null;
  gridLayout: BrandWebsiteMenuGridLayout;
  showPrice: boolean;
  showDescription: boolean;
  stickyCategories: boolean;
  defaultLocationId?: string | null;
  updatedAt: any;
}
