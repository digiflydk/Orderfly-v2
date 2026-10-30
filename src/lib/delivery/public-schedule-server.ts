import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { deliveryAdoptionKey } from './quotes/adoption';
import { deliveryId } from './settings/schema';
import { loadDeliverySettingsInTransaction } from './settings/server';
import { unavailableManagedDeliverySchedule, type ManagedDeliverySchedule } from './public-schedule';

const scopeSchema = z.object({ brandId: deliveryId, locationId: deliveryId }).strict();
const adoptionSchema = scopeSchema.extend({ version: z.literal(1), mode: z.literal('managed') }).strict();

/** Public restaurant availability, scoped and projected on the server. Null means verified legacy. */
export async function readPublicManagedDeliverySchedule(scope: { brandId: string; locationId: string }): Promise<ManagedDeliverySchedule | null> {
  try {
    const parsed = scopeSchema.parse(scope);
    return await getAdminDb().runTransaction(async tx => {
      const location = await tx.get(getAdminDb().collection('locations').doc(parsed.locationId));
      if (!location.exists || location.data()?.brandId !== parsed.brandId) throw Error('delivery_scope_invalid');
      const marker = await tx.get(getAdminDb().collection('deliveryAdoptions').doc(deliveryAdoptionKey(parsed)));
      if (!marker.exists) return null;
      const adoption = adoptionSchema.parse(marker.data());
      if (adoption.brandId !== parsed.brandId || adoption.locationId !== parsed.locationId) throw Error('delivery_scope_invalid');
      const { result } = await loadDeliverySettingsInTransaction(tx, parsed.brandId, parsed.locationId);
      const { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes, scheduleMode, pickupOpeningOffsetMinutes, pickupClosingOffsetMinutes } = result.settings;
      return { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes, scheduleMode, pickupOpeningOffsetMinutes, pickupClosingOffsetMinutes };
    });
  } catch { return unavailableManagedDeliverySchedule(); }
}
