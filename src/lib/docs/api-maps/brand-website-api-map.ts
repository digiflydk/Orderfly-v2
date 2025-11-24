
'use server';
import { ApiMapConfig } from '@/lib/docs/api-map-types';

export const brandWebsiteApiMap: ApiMapConfig = {
  module: 'brand-website',
  label: 'Brand Website',
  description: 'CMS + public APIs for the multi-domain brand website module',

  cms: {
    areas: [
      {
        id: 'config',
        label: 'Config & Design System',
        actions: [
          'getBrandWebsiteConfig',
          'saveBrandWebsiteConfig',
          'saveBrandWebsiteDesignSystem',
          'saveBrandWebsiteSeo',
          'saveBrandWebsiteSocial',
          'saveBrandWebsiteTracking',
          'saveBrandWebsiteLegal',
        ],
        firestorePaths: [
          'brands/{brandId}/website/config',
        ],
        notes: 'Global website config including design system, SEO, social, tracking and legal.',
      },
      {
        id: 'home',
        label: 'Homepage',
        actions: [
          'getBrandWebsiteHome',
          'saveBrandWebsiteHero',
          'saveBrandWebsitePromoTiles',
          'saveBrandWebsiteCampaignBanner',
          'saveBrandWebsiteMenuPreview',
          'saveBrandWebsiteFooterCta',
        ],
        firestorePaths: [
          'brands/{brandId}/website/home',
        ],
        notes: 'Homepage content for the brand website (hero, tiles, banners, footer CTA etc.).',
      },
      {
        id: 'pages',
        label: 'Custom Pages',
        actions: [
          'listBrandWebsitePages',
          'getBrandWebsitePage',
          'createBrandWebsitePage',
          'updateBrandWebsitePage',
          'deleteBrandWebsitePage',
        ],
        firestorePaths: [
          'brands/{brandId}/website/pages/{slug}',
        ],
        notes: 'Custom information pages such as About, Catering, FAQ etc.',
      },
      {
        id: 'menuSettings',
        label: 'Menu Settings',
        actions: [
          'getBrandWebsiteMenuSettings',
          'saveBrandWebsiteMenuSettings',
        ],
        firestorePaths: [
          'brands/{brandId}/website/menuSettings',
        ],
        notes: 'Configuration of public menu layout (grid size, hero, sticky categories, etc.).',
      },
    ],
  },

  public: {
    areas: [
      {
        id: 'config',
        label: 'Public Config',
        actions: [
          'getPublicBrandWebsiteConfig',
        ],
        firestorePaths: [
          'brands/{brandId}/website/config',
        ],
      },
      {
        id: 'home',
        label: 'Public Home',
        actions: [
          'getPublicBrandWebsiteHome',
        ],
        firestorePaths: [
          'brands/{brandId}/website/home',
        ],
      },
      {
        id: 'pages',
        label: 'Public Pages',
        actions: [
          'getPublicBrandWebsitePages',
          'getPublicBrandWebsitePageBySlug',
        ],
        firestorePaths: [
          'brands/{brandId}/website/pages/{slug}',
        ],
      },
      {
        id: 'menuSettings',
        label: 'Public Menu Settings',
        actions: [
          'getPublicBrandWebsiteMenuSettings',
        ],
        firestorePaths: [
          'brands/{brandId}/website/menuSettings',
        ],
      },
      {
        id: 'menu',
        label: 'Public Menu',
        actions: [
          'getPublicBrandMenuData',
        ],
        firestorePaths: [
          'brands/{brandId}/categories',
          'brands/{brandId}/menu',
        ],
      },
      {
        id: 'locations',
        label: 'Public Locations',
        actions: [
          'getPublicBrandLocationData',
        ],
        firestorePaths: [
          'brands/{brandId}/locations/{locationId}',
        ],
      },
    ],
  },

  domainResolver: {
    label: 'Domain Resolver',
    actions: ['resolveBrandByDomain'],
    firestorePaths: [
      'brands/{brandId}/website/config (domains array)',
    ],
    notes: 'Resolves request hostname → brandId using website.config.domains.',
  },

  logging: {
    audit: {
      label: 'Audit Logs',
      firestorePath: 'auditLogs/{autoId}',
      notes: 'Write-on-change logs for all CMS actions in the brand-website module.',
    },
    api: {
      label: 'Developer API Logs',
      firestorePath: 'dadmin/developer/logs/{autoId}',
      notes: 'Performance and error logs for public and CMS brand-website APIs (layer=cms/public, module=brand-website).',
    },
  },
};
