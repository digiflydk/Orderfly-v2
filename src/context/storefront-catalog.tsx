'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComboMenu, ProductForMenu, Upsell } from '@/types';
import { useCart } from '@/context/cart-context';
import { handledUpsells, markUpsellHandled } from '@/lib/handled-upsells';
import { lineMoney } from '@/lib/money';
import { relevantUpsellProducts } from '@/lib/relevant-upsell-products';
import { UpsellDialog } from '@/components/checkout/upsell-dialog';
export type StorefrontUpsell = {
  upsell: Pick<Upsell, 'id' | 'upsellName' | 'description' | 'discountType' | 'discountValue'>;
  products: ProductForMenu[];
};
const Catalog = createContext<{
  products: ProductForMenu[]; combos: ComboMenu[];
  openCart: (proceed: () => void) => void; cartOpening: boolean;
}>({ products: [], combos: [], openCart: proceed => proceed(), cartOpening: false });
export const useStorefrontCatalog = () => useContext(Catalog);

/** One shared gate for mobile, desktop and header cart entry points. */
export function StorefrontCatalog({ products, combos, children }: {
  products: ProductForMenu[]; combos: ComboMenu[]; children: ReactNode;
}) {
  const { brand, location, deliveryType, cartItems, cartReady } = useCart();
  const [popup, setPopup] = useState<StorefrontUpsell | null>(null);
  const [cartOpening, setCartOpening] = useState(false);
  const pending = useRef(false), continuation = useRef<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null);
  const scope = `${brand?.id}/${location?.id}/${deliveryType}`;
  const cartKey = JSON.stringify([scope, cartItems]);
  const latestKey = useRef(cartKey); latestKey.current = cartKey;
  const latestScope = useRef(scope); latestScope.current = scope;
  useEffect(() => () => {
    request.current?.abort(); continuation.current = null; pending.current = false;
  }, []);
  useEffect(() => {
    request.current?.abort(); continuation.current = null; pending.current = false;
    setPopup(null); setCartOpening(false);
  }, [scope]);

  const finish = () => {
    if (!continuation.current) return;
    const proceed = continuation.current; continuation.current = null;
    if (popup) markUpsellHandled(popup.upsell.id);
    setPopup(null); pending.current = false; setCartOpening(false);
    proceed();
  };
  const openCart = async (proceed: () => void) => {
    if (pending.current || !cartReady) return;
    if (!brand || !location || !deliveryType || !cartItems.length) { proceed(); return; }
    pending.current = true; setCartOpening(true); continuation.current = proceed;
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 2000);
    let selected: StorefrontUpsell | null = null;
    try {
      const response = await fetch('/api/public/upsell', {method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', signal:controller.signal,
        body:JSON.stringify({brandId:brand.id, locationId:location.id, deliveryType, cartTotal:0, excludedUpsellIds:handledUpsells(),
          cartItems:cartItems.map(item => ({id:item.id, itemType:item.itemType, quantity:item.quantity,
            totalPrice:lineMoney(item.price, item.quantity, item.toppings.map(t=>t.price)),
            toppingIds:item.toppings.map(t=>t.id).filter(Boolean).slice(0,50),
            includedProductIds:item.comboSelections?.flatMap(g=>g.products.map(p=>p.id)),
            comboSelections:item.comboSelections?.map(g=>({groupId:g.groupId,groupName:g.groupName,products:g.products.map(p=>({id:p.id}))})),
          }))})});
      const data = response.ok ? await response.json() : null;
      if (data && Array.isArray(data.products) && typeof data.upsell?.id === 'string' && typeof data.upsell?.upsellName === 'string'
        && !handledUpsells().includes(data.upsell.id) && ['none','percentage','fixed_amount'].includes(data.upsell.discountType)
        && (data.upsell.discountType === 'none' || Number.isFinite(data.upsell.discountValue) && data.upsell.discountValue > 0)) {
        const available = relevantUpsellProducts(data.products, products, cartItems);
        if (available.length) selected = {upsell:data.upsell, products:available};
      }
    } catch { /* Optional upsell must never block the basket. */ }
    finally { clearTimeout(timer); }
    // An obsolete restaurant request must not open another restaurant's basket.
    if (request.current !== controller || latestScope.current !== scope || !continuation.current) return;
    setCartOpening(false);
    if (selected && latestKey.current === cartKey) setPopup(selected);
    else { const next = continuation.current; continuation.current = null; pending.current = false; next(); }
  };
  return <Catalog.Provider value={{products, combos, openCart, cartOpening}}>
    {children}
    {popup && <UpsellDialog key={`${scope}/${popup.upsell.id}`} upsellData={popup} onContinue={finish} />}
  </Catalog.Provider>;
}
