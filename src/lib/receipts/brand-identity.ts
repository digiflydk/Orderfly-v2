import { z } from 'zod';

const text = z.string().max(1000);
export const receiptBrandIdentitySchema = z.object({
  name: text, registrationNumber: text, address: text,
  logoUrl: z.string().max(4096).refine(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }).optional(),
}).strict();
export type ReceiptBrandIdentity = z.infer<typeof receiptBrandIdentitySchema>;

/** Only public receipt fields; never pass a raw brand record to the browser. */
export function projectReceiptBrand(brand: Record<string, unknown>): ReceiptBrandIdentity {
  const field = (key: string) => typeof brand[key] === 'string' ? (brand[key] as string).trim().slice(0, 300).replace(/[\u0000-\u001f\u007f]/g, '') : '';
  const logo = receiptBrandIdentitySchema.shape.logoUrl.safeParse(brand.logoUrl);
  return { name: field('companyName') || field('name'), registrationNumber: field('companyRegNo'),
    address: [field('street'), [field('zipCode'), field('city')].filter(Boolean).join(' '), field('country')].filter(Boolean).join(', '),
    ...(logo.success && logo.data ? { logoUrl: logo.data } : {}),
  };
}
