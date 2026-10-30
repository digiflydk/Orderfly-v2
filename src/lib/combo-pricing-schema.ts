import { z } from 'zod';

export const comboProductAdjustmentsSchema = z.record(z.number().finite().min(0).max(100000)).optional();
export function validComboAdjustmentKeys(group: {productIds: string[]; productPriceAdjustments?: Record<string, number>}): boolean {
  return Object.keys(group.productPriceAdjustments || {}).every(id => group.productIds.includes(id));
}
