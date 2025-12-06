
'use server';
import { z } from 'zod';
import { brandWebsiteConfigBaseSchema } from '../superadmin/brand-website/config-schemas';

export type BrandWebsiteConfig = z.infer<typeof brandWebsiteConfigBaseSchema>;
