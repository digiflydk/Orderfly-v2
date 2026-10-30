'use client';

import { createContext, useContext, type ReactNode } from 'react';

const StorefrontV2Context = createContext(false);

// Determined by the server host, not a query flag or a persisted preference.
// React portals retain this context without changing global body styles.
export function StorefrontV2Provider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <StorefrontV2Context.Provider value={enabled}>{children}</StorefrontV2Context.Provider>;
}

export function useStorefrontV2(): boolean {
  return useContext(StorefrontV2Context);
}
