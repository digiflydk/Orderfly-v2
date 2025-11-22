'use server';

import { z } from 'zod';

export const brandWebsiteHeroSlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  highlight: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

export const brandWebsitePromoTileSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const brandWebsiteCampaignBannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  active: z.boolean().default(true),
});

export const brandWebsiteMenuPreviewItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  sortOrder: z.number().optional(),
});

export const brandWebsiteFooterCtaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});

export const brandWebsiteHomeSchema = z.object({
  hero: z.array(brandWebsiteHeroSlideSchema).default([]),
  promoTiles: z.array(brandWebsitePromoTileSchema).default([]),
  campaignBanner: brandWebsiteCampaignBannerSchema.nullable().default(null),
  menuPreview: z.array(brandWebsiteMenuPreviewItemSchema).default([]),
  footerCta: brandWebsiteFooterCtaSchema.nullable().default(null),
});

export type BrandWebsiteHeroSlideInput = z.infer<
  typeof brandWebsiteHeroSlideSchema
>;
export type BrandWebsitePromoTileInput = z.infer<
  typeof brandWebsitePromoTileSchema
>;
export type BrandWebsiteCampaignBannerInput = z.infer<
  typeof brandWebsiteCampaignBannerSchema
>;
export type BrandWebsiteMenuPreviewItemInput = z.infer<
  typeof brandWebsiteMenuPreviewItemSchema
>;
export type BrandWebsiteFooterCtaInput = z.infer<
  typeof brandWebsiteFooterCtaSchema
>;
export type BrandWebsiteHomeInput = z.infer<typeof brandWebsiteHomeSchema>;
