import type { ComboMenu } from '@/types';
import { restaurantClock } from './promotion-rules';

type Schedule = Pick<ComboMenu, 'isActive' | 'brandId' | 'locationIds' | 'orderTypes' | 'activeDays' | 'activeTimeSlots'> & {startDate?: unknown; endDate?: unknown; isTestData?: boolean};
export function comboEligible(combo: Schedule, scope: {brandId?: string; locationId: string; deliveryType?: 'pickup' | 'delivery'; now?: Date}) {
  const now = scope.now || new Date(), clock = restaurantClock(now);
  const instant = (value: unknown) => typeof (value as {toDate?: unknown})?.toDate === 'function'
    ? (value as {toDate: () => Date}).toDate() : new Date(value as string);
  return combo.isActive && combo.isTestData !== true && (!scope.brandId || combo.brandId === scope.brandId) &&
    (!combo.locationIds?.length || combo.locationIds.includes(scope.locationId)) &&
    (!scope.deliveryType || combo.orderTypes?.includes(scope.deliveryType)) &&
    (!combo.startDate || instant(combo.startDate) <= now) && (!combo.endDate || instant(combo.endDate) >= now) &&
    (!combo.activeDays?.length || combo.activeDays.includes(clock.day)) &&
    (!combo.activeTimeSlots?.length || combo.activeTimeSlots.some(slot => clock.time >= slot.start && clock.time <= slot.end));
}

export function comboProductsAvailable(
  combo: Pick<ComboMenu, 'productGroups'>,
  products: Array<{id: string}>,
) {
  const available = new Set(products.map(product => product.id));
  return combo.productGroups.length > 0 &&
    combo.productGroups.every(group => group.productIds.length > 0 && group.productIds.every(id => available.has(id)));
}
