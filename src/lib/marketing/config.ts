import 'server-only';
import { z } from 'zod';
const mapping = z.object({ brandId: z.string().min(1), omnisendBrandId: z.string().min(1), apiKey: z.string().min(10),
    enabled: z.boolean().default(false), consentMode: z.literal('single_opt_in') });
export type MarketingConfig = z.infer<typeof mapping>;
export function marketingConfig(brandId: string): MarketingConfig | null {
    try {
        const entries = z.array(mapping).max(100).parse(JSON.parse(process.env.ORDERFLY_OMNISEND_BRANDS || '[]'));
        if (new Set(entries.map(e => e.brandId)).size !== entries.length || new Set(entries.map(e => e.omnisendBrandId)).size !== entries.length)
            return null;
        return entries.find(entry => entry.brandId === brandId && entry.enabled) || null;
    }
    catch {
        return null;
    }
}
