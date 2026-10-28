'use client';

import { createContext, useContext, type ReactNode } from 'react';

const DeliveryPriceContext = createContext(false);

/** Server-resolved route setting. Never substitutes for checkout price authority. */
export function DeliveryPriceProvider({ managed, children }: { managed: boolean; children: ReactNode }) {
  return <DeliveryPriceContext.Provider value={managed}>{children}</DeliveryPriceContext.Provider>;
}

export const useManagedDeliveryPrice = () => useContext(DeliveryPriceContext);
