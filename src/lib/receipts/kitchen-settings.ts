import { z } from 'zod';

/** Kitchen presentation only. Operational details cannot be disabled. */
export const kitchenSettingsSchema = z.object({
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  heading: z.string().max(80).refine(value => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value), 'Unsupported control character'),
  showBrandName: z.boolean(),
  showLocationName: z.boolean(),
  showCustomer: z.boolean(),
  showPhone: z.boolean(),
  groupByCategory: z.boolean(),
  textSize: z.enum(['normal', 'large']),
}).strict();
export type KitchenSettings = z.infer<typeof kitchenSettingsSchema>;
export const DEFAULT_KITCHEN_SETTINGS: Readonly<KitchenSettings> = Object.freeze({
  paperWidthMm: 80, heading: 'Køkkenbon', showBrandName: true, showLocationName: true,
  showCustomer: true, showPhone: false, groupByCategory: true, textSize: 'large',
});
export type KitchenSettingsRecord = { brandId: string; revision: number; settings: KitchenSettings };
