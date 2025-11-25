
import { z } from 'zod';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';

export const brandWebsiteNavLinkSchema = z.object({
  label: z.string().min(1, 'Label cannot be empty'),
  href: z.string().min(1, 'Link URL cannot be empty'),
});

const defaultTypography = {
  headingFont: 'Inter, sans-serif',
  bodyFont: 'Inter, sans-serif',
  h1Size: '3rem',
  h2Size: '2.25rem',
  h3Size: '1.875rem',
  bodySize: '1rem',
  buttonSize: '0.875rem',
};

const typographySchema = z
  .object({
    headingFont: z.string().min(1).default(defaultTypography.headingFont),
    bodyFont: z.string().min(1).default(defaultTypography.bodyFont),
    h1Size: z.string().min(1).default(defaultTypography.h1Size),
    h2Size: z.string().min(1).default(defaultTypography.h2Size),
    h3Size: z.string().min(1).default(defaultTypography.h3Size),
    bodySize: z.string().min(1).default(defaultTypography.bodySize),
    buttonSize: z.string().min(1).default(defaultTypography.buttonSize),
  })
  .default(defaultTypography);

const buttonVariantSchema = z.object({
  background: z.string(),
  text: z.string(),
});

const defaultButtonStyles = {
  borderRadius: "9999px",
  paddingX: "1.25rem",
  paddingY: "0.75rem",
  fontWeight: "600",
  uppercase: false,
  primaryVariant: {
    background: '#FFBD02', // m3-orange
    text: '#000000', // m3-dark
  },
  secondaryVariant: {
    background: '#333333',
    text: '#FFFFFF',
  },
};

const brandWebsiteButtonSchema = z
  .object({
    borderRadius: z.string().default(defaultButtonStyles.borderRadius),
    paddingX: z.string().default(defaultButtonStyles.paddingX),
    paddingY: z.string().default(defaultButtonStyles.paddingY),
    fontWeight: z.string().default(defaultButtonStyles.fontWeight),
    uppercase: z.boolean().default(defaultButtonStyles.uppercase),
    primaryVariant: buttonVariantSchema.default(
      defaultButtonStyles.primaryVariant
    ),
    secondaryVariant: buttonVariantSchema.default(
      defaultButtonStyles.secondaryVariant
    ),
  })
  .default(defaultButtonStyles);

export const brandWebsiteDesignSystemSchema = z
  .object({
    typography: typographySchema,
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
    buttons: brandWebsiteButtonSchema,
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
  })
  .default({
    typography: defaultTypography,
    buttons: defaultButtonStyles,
  });

export const brandWebsiteSeoSchema = z
  .object({
    defaultTitle: z.string().optional(),
    defaultDescription: z.string().optional(),
    ogImageUrl: z.string().url({ message: "Must be a valid URL" }).or(z.literal('')).optional(),
    canonicalUrl: z.string().url({ message: "Must be a valid URL"}).or(z.literal('')).optional(),
    index: z.boolean().optional().default(true),
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
  logoUrl: z.string().url().or(z.literal('')).optional(),
  faviconUrl: z.string().url().or(z.literal('')).optional(),
});

export type DesignSystemInput = z.infer<typeof brandWebsiteDesignSystemSchema>;
export type SeoInput = z.infer<typeof brandWebsiteSeoSchema>;
export type SocialInput = z.infer<typeof brandWebsiteSocialSchema>;
export type TrackingInput = z.infer<typeof brandWebsiteTrackingSchema>;
export type LegalInput = z.infer<typeof brandWebsiteLegalSchema>;
export type SaveBrandWebsiteConfigInput = z.infer<
  typeof brandWebsiteConfigBaseSchema
>;

export const VIRTUAL_CONFIG: BrandWebsiteConfig = {
  active: false,
  template: 'template-1',
  domains: [],
  defaultLocationId: null,
  faviconUrl: '/favicon.ico', // Default fallback
  designSystem: {},
  seo: {},
  social: {},
  tracking: {},
  legal: {},
  updatedAt: null,
};
