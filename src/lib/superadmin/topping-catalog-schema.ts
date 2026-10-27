import { z } from 'zod';

export const catalogIdentifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const count = z.coerce.number().int().min(0).max(50);
export const toppingGroupSchema = z.object({
  id: catalogIdentifier.optional(),
  locationIds: z.array(catalogIdentifier).min(1).max(100),
  groupName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().max(200).optional(),
  kind: z.enum(['addition', 'removal']).optional(),
  selectionMode: z.enum(['single', 'multiple']).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  minSelection: count,
  maxSelection: count,
}).superRefine((value, ctx) => {
  if (value.maxSelection !== 0 && value.maxSelection < value.minSelection) ctx.addIssue({code:'custom',path:['maxSelection'],message:'Maksimum skal være 0 (ubegrænset) eller mindst minimum.'});
  if (value.kind === 'removal' && value.minSelection !== 0) ctx.addIssue({code:'custom',path:['minSelection'],message:'Fravalg skal være frivillige (minimum 0).'});
});
export const toppingSchema = z.object({
  id: catalogIdentifier.optional(),
  locationIds: z.array(catalogIdentifier).min(1).max(100),
  groupId: catalogIdentifier,
  toppingName: z.string().trim().min(2).max(200),
  price: z.coerce.number().finite().min(0).max(100000),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  maxQuantity: z.coerce.number().int().min(1).max(50).optional(),
  productId: z.preprocess(value => value === '' ? undefined : value, catalogIdentifier.optional()),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});
export const toppingOverridesSchema = z.record(catalogIdentifier, z.object({
  price: z.number().finite().min(0).max(100000).optional(),
  isDefault: z.boolean().optional(),
  defaultQuantity: z.number().int().min(1).max(50).optional(),
  isAvailable: z.boolean().optional(),
}).strict()).refine(value => Object.keys(value).length <= 500, 'For mange tilvalgsindstillinger.');

type Group = {id:string;kind?:string;selectionMode?:string;minSelection?:number;maxSelection?:number};
type Option = {id:string;groupId:string;locationIds?:string[];price?:number;isDefault?:boolean;maxQuantity?:number};
export function validateToppingOverrides(value: unknown, attached: string[], groups: Group[], options: Option[], locations: string[]): string | null {
  const parsed = toppingOverridesSchema.safeParse(value);
  if (!parsed.success) return 'Ugyldige produktspecifikke tilvalg.';
  for (const [id, override] of Object.entries(parsed.data)) {
    const option = options.find(row => row.id === id);
    const group = groups.find(row => row.id === option?.groupId);
    if (!option || !group || !attached.includes(option.groupId) || locations.some(location => !option.locationIds?.includes(location))) return 'Tilvalget skal være tilknyttet produktet og tilgængeligt på alle valgte lokationer.';
    if ((override.defaultQuantity ?? 1) > (option.maxQuantity ?? 1)) return 'Standardantal overstiger tilvalgets maksimum.';
    if (group.kind === 'removal' && ((override.price ?? option.price ?? 0) !== 0 || (override.isDefault ?? option.isDefault) === true || (override.defaultQuantity ?? 1) !== 1)) return 'Fravalg skal være gratis og må ikke vælges som standard.';
    if (override.isAvailable === false && (override.isDefault === true || override.defaultQuantity !== undefined)) return 'Et skjult tilvalg kan ikke være standardvalg.';
  }
  return null;
}
