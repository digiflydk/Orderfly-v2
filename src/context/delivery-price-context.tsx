'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ManagedDeliverySchedule } from '@/lib/delivery/public-schedule';

const DeliveryPriceContext = createContext(false);
const ManagedDeliveryScheduleContext = createContext<ManagedDeliverySchedule | null>(null);

/** Server-resolved route setting. Never substitutes for checkout price authority. */
export function DeliveryPriceProvider({ managed, schedule = null, children }: { managed: boolean; schedule?: ManagedDeliverySchedule | null; children: ReactNode }) {
  return <DeliveryPriceContext.Provider value={managed}><ManagedDeliveryScheduleContext.Provider value={managed ? schedule : null}>{children}</ManagedDeliveryScheduleContext.Provider></DeliveryPriceContext.Provider>;
}

export const useManagedDeliveryPrice = () => useContext(DeliveryPriceContext);

/** Public availability only; the server revalidates settings and the selected time. */
export const useManagedDeliverySchedule = () => useContext(ManagedDeliveryScheduleContext);
