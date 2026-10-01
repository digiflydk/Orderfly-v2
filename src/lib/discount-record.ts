import type { Discount } from '@/types';
import { promotionDate } from './promotion-date';
import { discountApplicationType } from './promotion-rules';
import { upsellClientData } from './upsell-serialization';

/** Normalize the complete record, including nested audit timestamps, without writing it back. */
export function discountRecord(id: string, data: Record<string, any>): Discount {
  return {
    ...upsellClientData(data),
    id,
    applicationType: discountApplicationType(data),
    startDate: promotionDate(data.startDate),
    endDate: promotionDate(data.endDate),
    createdAt: promotionDate(data.createdAt) ?? null,
    updatedAt: promotionDate(data.updatedAt) ?? null,
  } as Discount;
}
