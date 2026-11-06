'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

type Slots = { controls: HTMLDivElement; cart: HTMLDivElement };
const targets = new Map<string, Slots>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const serverSnapshot = () => null;
const publish = () => listeners.forEach(listener => listener());

/** Only publish portal destinations after their owning React boundary has hydrated. */
export function MenuToolbarSlots({ brandSlug, locationId }: { brandSlug: string; locationId: string }) {
  const controls = useRef<HTMLDivElement>(null);
  const cart = useRef<HTMLDivElement>(null);
  const key = `${brandSlug}/${locationId}`;
  useEffect(() => {
    if (!controls.current || !cart.current) return;
    const slots = { controls: controls.current, cart: cart.current };
    targets.set(key, slots);
    publish();
    return () => {
      if (targets.get(key) === slots) { targets.delete(key); publish(); }
    };
  }, [key]);
  return <><div ref={controls} className="storefront-order-controls" data-menu-controls-slot />
    <div ref={cart} className="storefront-top-cart" data-menu-cart-slot /></>;
}

export function useMenuToolbarSlots(brandSlug: string, locationId: string) {
  return useSyncExternalStore(subscribe, () => targets.get(`${brandSlug}/${locationId}`) ?? null, serverSnapshot);
}
