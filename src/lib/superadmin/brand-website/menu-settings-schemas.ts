
import { z } from 'zod';

export const brandWebsiteMenuGridLayoutSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const brandWebsiteMenuHeroSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});

export const brandWebsiteMenuSettingsSchema = z.object({
  hero: brandWebsiteMenuHeroSchema.nullable().default(null),
  gridLayout: brandWebsiteMenuGridLayoutSchema.default(3),
  showPrice: z.boolean().default(true),
  showDescription: z.boolean().default(true),
  stickyCategories: z.boolean().default(true),
  defaultLocationId: z.string().min(1).nullable().optional(),
});

export type BrandWebsiteMenuHeroInput = z.infer<typeof brandWebsiteMenuHeroSchema>;
export type BrandWebsiteMenuSettingsInput = z.infer<typeof brandWebsiteMenuSettingsSchema>;
