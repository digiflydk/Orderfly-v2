'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { PRODUCT_LINK_PARAM, productIdForLink, productLinkSlugs, withProductLink } from '@/lib/product-link';

type ProductLink = {
  /** True exactly once, for the first card of the product the page was opened for. */
  claim: (productId: string) => boolean;
  /** Keeps the address in sync with the open product dialog, so it can be shared. */
  opened: (productId: string) => void;
  closed: (productId: string) => void;
};
const noop: ProductLink = { claim: () => false, opened: () => {}, closed: () => {} };
const Context = createContext<ProductLink>(noop);
export const useProductLink = () => useContext(Context);

/** The product id requested by ?produkt= on first render, or null. */
export function requestedProductId(products: { id: string; productName?: string | null; comboOnly?: boolean | null }[]): string | null {
  if (typeof window === 'undefined') return null;
  return productIdForLink(productLinkSlugs(products), new URLSearchParams(window.location.search).get(PRODUCT_LINK_PARAM));
}

export function ProductLinkProvider({ products, children }: { products: { id: string; productName?: string | null; comboOnly?: boolean | null }[]; children: ReactNode }) {
  const links = useMemo(() => productLinkSlugs(products), [products]);
  const target = useRef<string | null | undefined>(undefined);
  const claimed = useRef(false);
  const current = useRef<string | null>(null);
  const replace = (slug: string | null) => {
    // replaceState keeps Back leaving the menu as before; Next keeps its router state in sync.
    try { window.history.replaceState(window.history.state, '', withProductLink(window.location.href, slug)); } catch { /* Sharing is optional. */ }
  };
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(PRODUCT_LINK_PARAM);
    target.current = productIdForLink(links, value);
    // An unknown, inactive or renamed product leaves the customer on the menu without a stale link.
    if (value !== null && !target.current) replace(null);
  }, [links]);
  const claim = useCallback((productId: string) => {
    if (claimed.current) return false;
    const wanted = target.current === undefined ? productIdForLink(links, new URLSearchParams(window.location.search).get(PRODUCT_LINK_PARAM)) : target.current;
    if (!wanted || wanted !== productId) return false;
    claimed.current = true;
    return true;
  }, [links]);
  const opened = useCallback((productId: string) => {
    const slug = links.get(productId);
    if (!slug) return;
    current.current = productId; replace(slug);
  }, [links]);
  const closed = useCallback((productId: string) => {
    if (current.current !== productId) return;
    current.current = null; replace(null);
  }, []);
  const value = useMemo(() => ({ claim, opened, closed }), [claim, opened, closed]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
