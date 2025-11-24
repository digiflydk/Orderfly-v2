
import { z } from 'zod';

export const brandWebsitePageLayoutTypeSchema = z.enum([
  'rich-text-left-image-right',
]);

export const brandWebsitePageCtaSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
});

export const brandWebsitePageSeoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  ogImageUrl: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
  index: z.boolean().optional(),
});

export const brandWebsitePageSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase, alphanumeric with hyphens only');

export const brandWebsitePageBaseSchema = z.object({
  slug: brandWebsitePageSlugSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  layout: brandWebsitePageLayoutTypeSchema,
  body: z.string().min(1),
  imageUrl: z.string().url().optional(),
  cta: brandWebsitePageCtaSchema.nullable().optional(),
  seo: brandWebsitePageSeoSchema.optional(),
  sortOrder: z.number().optional(),
  isPublished: z.boolean().default(false),
});

export const brandWebsitePageCreateSchema = brandWebsitePageBaseSchema;

export const brandWebsitePageUpdateSchema = brandWebsitePageBaseSchema.partial().extend({
  slug: brandWebsitePageSlugSchema.optional(),
});

export type BrandWebsitePageCreateInput = z.infer<typeof brandWebsitePageCreateSchema>;
export type BrandWebsitePageUpdateInput = z.infer<typeof brandWebsitePageUpdateSchema>;
export type BrandWebsitePageSlugInput = z.infer<typeof brandWebsitePageSlugSchema>;
