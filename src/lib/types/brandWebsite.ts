export interface BrandWebsiteConfig {
  /** Whether the brand website is active and should be publicly available */
  active: boolean;

  /** Template identifier, e.g. "template-1" (more templates in future) */
  template: string;

  /** List of domains that should resolve to this brand website (e.g. ["minals.dk"]) */
  domains: string[];

  /** Default locationId for "Order now" CTAs (may be null if not configured) */
  defaultLocationId: string | null;

  /** Design system configuration for this brand website (colors, fonts, spacing, etc.) */
  designSystem: Record<string, any>;

  /** Default SEO configuration for the website (meta title, description, OG image, etc.) */
  seo: Record<string, any>;

  /** Social profile configuration (Facebook, Instagram, etc.) */
  social: Record<string, any>;

  /** Tracking configuration (GA4, GTM, Meta Pixel, etc.) */
  tracking: Record<string, any>;

  /** Legal configuration (cookie policy, privacy, terms). Can use platform defaults or custom text. */
  legal: Record<string, any>;

  /** Last updated timestamp */
  updatedAt: any; // if you have a shared Timestamp type, use it here instead of any
}

export interface BrandWebsiteHome {
  /** Hero section slides for homepage */
  hero: any[];

  /** Promo tiles on homepage */
  promoTiles: any[];

  /** Optional campaign banner on homepage */
  campaignBanner: any | null;

  /** Menu preview configuration / featured items on homepage */
  menuPreview: any[];

  /** Footer call-to-action configuration */
  footerCta: any | null;

  /** Last updated timestamp */
  updatedAt: any;
}

export interface BrandWebsitePage {
  /** Slug of the page, e.g. "about", "catering" */
  slug: string;

  /** Human-readable title of the page */
  title: string;

  /** Type of content, e.g. "richTextLeftImageRight" (V1) */
  contentType: string;

  /** Content payload for the page, structure depends on contentType */
  content: Record<string, any>;

  /** Optional CTA configuration */
  cta?: Record<string, any> | null;

  /** SEO configuration for this specific page (overrides defaults) */
  seo: Record<string, any>;

  /** Last updated timestamp */
  updatedAt: any;
}

export interface BrandWebsiteMenuSettings {
  /** Hero configuration for menu page */
  menuHero: Record<string, any>;

  /** Number of columns in grid layout (2, 3, or 4) */
  gridColumns: number;

  /** Whether to show product prices on menu page */
  showPrice: boolean;

  /** Whether to show product descriptions on menu page */
  showDescription: boolean;

  /** Whether menu categories should be sticky on scroll */
  stickyCategories: boolean;

  /** Last updated timestamp */
  updatedAt: any;
}
