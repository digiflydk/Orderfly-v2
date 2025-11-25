
'use server';

import { z } from 'zod';

export const brandWebsiteNavLinkSchema = z.object({
  label: z.string().min(1, 'Label cannot be empty'),
  href: z.string().min(1, 'Link URL cannot be empty'),
});

export const brandWebsiteDesignSystemSchema = z.object({
  typography: z
    .object({
      headingFont: z.string().min(1),
      bodyFont: z.string().min(1),
      h1Size: z.string().min(1),
      h2Size: z.string().min(1),
      h3Size: z.string().min(1),
      bodySize: z.string().min(1),
      buttonSize: z.string().min(1).optional(), // New field
    })
    .optional(),
  colors: z
    .object({
      primary: z.string().min(1),
      secondary: z.string().min(1),
      background: z.string().min(1),
      textPrimary: z.string().min(1),
      textSecondary: z.string().min(1),
      headerBackground: z.string().min(1),
      footerBackground: z.string().min(1),
    })
    .optional(),
  buttons: z
    .object({
      shape: z.enum(['pill', 'rounded', 'square']).optional(),
      defaultVariant: z.string().optional(),
    })
    .partial()
    .optional(),
  header: z
    .object({
      sticky: z.boolean().optional(),
      height: z.string().optional(),
      transparencyPercent: z.number().min(0).max(100).optional(),
    })
    .partial()
    .optional(),
  spacing: z
    .object({
      xs: z.number().optional(),
      sm: z.number().optional(),
      md: z.number().optional(),
      lg: z.number().optional(),
      xl: z.number().optional(),
    })
    .partial()
    .optional(),
});

export const brandWebsiteSeoSchema = z
  .object({
    defaultTitle: z.string().min(1),
    defaultDescription: z.string().min(1),
    ogImageUrl: z.string().url().optional(),
    canonicalUrl: z.string().url().optional(),
    index: z.boolean().optional(),
  })
  .partial()
  .strict();

export const brandWebsiteSocialSchema = z
  .object({
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    tiktok: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    x: z.string().url().optional(),
    shareImageUrl: z.string().url().optional(),
  })
  .partial()
  .strict();

export const brandWebsiteTrackingSchema = z
  .object({
    ga4MeasurementId: z.string().optional(),
    gtmId: z.string().optional(),
    metaPixelId: z.string().optional(),
    tiktokPixelId: z.string().optional(),
    googleAdsConversionId: z.string().optional(),
  })
  .partial()
  .strict();

export const brandWebsiteLegalSchema = z
  .object({
    usePlatformDefaults: z.boolean().optional(),
    customCookiePolicy: z.string().optional(),
    customPrivacyPolicy: z.string().optional(),
    customTerms: z.string().optional(),
  })
  .partial()
  .strict();

export const brandWebsiteConfigBaseSchema = z.object({
  active: z.boolean(),
  template: z.string().min(1),
  domains: z.array(z.string().min(1)).default([]),
  defaultLocationId: z.string().nullable().default(null),
  headerNavLinks: z.array(brandWebsiteNavLinkSchema).optional(),
});

export type DesignSystemInput = z.infer<typeof brandWebsiteDesignSystemSchema>;
export type SeoInput = z.infer<typeof brandWebsiteSeoSchema>;
export type SocialInput = z.infer<typeof brandWebsiteSocialSchema>;
export type TrackingInput = z.infer<typeof brandWebsiteTrackingSchema>;
export type LegalInput = z.infer<typeof brandWebsiteLegalSchema>;
export type SaveBrandWebsiteConfigInput = z.infer<typeof brandWebsiteConfigBaseSchema>;
