'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComboMenu, ProductForMenu, Upsell } from '@/types';
import { useAnalytics } from '@/context/analytics-context';
import { useCart } from '@/context/cart-context';
import { handledUpsells, markUpsellHandled } from '@/lib/handled-upsells';
import { lineMoney } from '@/lib/money';
import { relevantUpsellProducts } from '@/lib/relevant-upsell-products';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UpsellDialog } from '@/components/checkout/upsell-dialog';
export type StorefrontUpsell = {
  badges?: Record<string, 'popular'|'recommended'|'none'>;
  step?: number;
  badgeSources?: Record<string,string>;
  upsell: Pick<Upsell, 'id' | 'displayHeading' | 'upsellName' | 'description' | 'discountType' | 'discountValue'>;
  products: ProductForMenu[];
};
const Catalog = createContext<{
  products: ProductForMenu[]; combos: ComboMenu[];
  openCart: (proceed: () => void, destination?: 'cart' | 'checkout') => void; cartOpening: boolean;
}>({ products: [], combos: [], openCart: proceed => proceed(), cartOpening: false });
export const useStorefrontCatalog = () => useContext(Catalog);

/** One shared gate for mobile, desktop and header cart entry points. */
export function StorefrontCatalog({ products, combos, children }: {
  products: ProductForMenu[]; combos: ComboMenu[]; children: ReactNode;
}) {
  const {trackEvent,sessionId} = useAnalytics();
  const { brand, location, deliveryType, cartItems, cartReady } = useCart();
  const [previousUpsellId,setPreviousUpsellId] = useState<string | undefined>();
  const followupPending = useRef(false);
  const [destination, setDestination] = useState<'cart' | 'checkout'>('cart');
  const [popup, setPopup] = useState<StorefrontUpsell | null>(null);
  const [cartOpening, setCartOpening] = useState(false);
  const opening = useRef(0);
  const pending = useRef(false), continuation = useRef<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null);
  const prepared = useRef<{key: string; expires: number; promise: Promise<unknown>} | null>(null);
  const scope = `${brand?.id}/${location?.id}/${deliveryType}`;
  const cartKey = JSON.stringify([scope, cartItems]);
  const latestKey = useRef(cartKey); latestKey.current = cartKey;
  const latestScope = useRef(scope); latestScope.current = scope;
  const payload = JSON.stringify({previousUpsellId,brandId:brand?.id, locationId:location?.id, deliveryType, cartTotal:0, excludedUpsellIds:handledUpsells(),
    cartItems:cartItems.map(item => ({id:item.id, upsellId:item.upsellId, itemType:item.itemType, quantity:item.quantity,
      totalPrice:lineMoney(item.price, item.quantity, item.toppings.map(t=>t.price)),
      toppingIds:item.toppings.map(t=>t.id).filter(Boolean).slice(0,50),
      includedProductIds:item.comboSelections?.flatMap(g=>g.products.map(p=>p.id)),
      comboSelections:item.comboSelections?.map(g=>({groupId:g.groupId,groupName:g.groupName,products:g.products.map(p=>({id:p.id}))})),
    }))});
  const prepare = () => {
    if (prepared.current?.key === payload && prepared.current.expires > Date.now()) return prepared.current.promise;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), previousUpsellId ? 30000 : 15000);
    const entry = {key:payload, expires:Date.now()+30000, promise:Promise.resolve(null) as Promise<unknown>};
    entry.promise = fetch('/api/public/upsell', {method:'POST', headers:{'Content-Type':'application/json'},
      cache:'no-store', signal:controller.signal, body:payload})
      .then(async response => { if (!response.ok) throw new Error('Upsell unavailable'); return response.json(); })
      .catch(() => { entry.expires = 0; return null; })
      .finally(() => clearTimeout(timer));
    prepared.current = entry;
    return entry.promise;
  };
  useEffect(() => () => {
    opening.current++; request.current?.abort(); continuation.current = null; pending.current = false;
  }, []);
  useEffect(() => {
    opening.current++; request.current?.abort(); prepared.current = null; continuation.current = null; pending.current = false;
    setPreviousUpsellId(undefined); followupPending.current=false;
    setPopup(null); setCartOpening(false);
  }, [scope]);

  useEffect(() => {
    if (!cartReady || !brand || !location || !deliveryType || !cartItems.length) return;
    // Coalesce quick quantity changes; opening the basket reuses this request.
    const timer = setTimeout(() => { void prepare(); }, 250);
    return () => { clearTimeout(timer); request.current?.abort(); prepared.current = null; };
    // payload includes the complete cart, restaurant, channel and handled offers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, cartReady]);

  useEffect(() => {
    if (!followupPending.current || !previousUpsellId || !continuation.current) return;
    followupPending.current=false;
    const next=continuation.current;
    pending.current=false;
    void openCart(next, destination);
    // Run after the accepted product has committed to cart state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousUpsellId,cartKey]);
  const finish = (accepted = false) => {
    if (!continuation.current) return;
    if (accepted && popup && !previousUpsellId) {
      markUpsellHandled(popup.upsell.id);
      followupPending.current=true;
      setPreviousUpsellId(popup.upsell.id); setPopup(null); return;
    }
    opening.current++; request.current?.abort();
    const proceed = continuation.current; continuation.current = null;
    setPreviousUpsellId(undefined);
    if (popup) markUpsellHandled(popup.upsell.id);
    setPopup(null); pending.current = false; setCartOpening(false);
    proceed();
  };
  const openCart = async (proceed: () => void, target: 'cart' | 'checkout' = 'cart') => {
    if (pending.current || !cartReady) return;
    if (!brand || !location || !deliveryType || !cartItems.length) { proceed(); return; }
    pending.current = true; setDestination(target); setCartOpening(true); continuation.current = proceed;
    const attempt = ++opening.current;
    const lookup = prepare();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let selected: StorefrontUpsell | null = null;
    try {
      // Prefetched offers are immediate. A first click still tolerates a slow
      // cold request, but an unavailable service can never trap the customer.
      const data: any = await Promise.race([lookup, new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), previousUpsellId ? 30000 : 10000);
      })]);
      if (data && Array.isArray(data.products) && typeof data.upsell?.id === 'string' && typeof data.upsell?.upsellName === 'string'
        && !handledUpsells().includes(data.upsell.id) && ['none','percentage','fixed_amount'].includes(data.upsell.discountType)
        && (data.upsell.discountType === 'none' || Number.isFinite(data.upsell.discountValue) && data.upsell.discountValue > 0)) {
        const available = relevantUpsellProducts(data.products, products, cartItems);
        if (available.length) selected = {upsell:data.upsell, products:available,badges:data.badges,step:data.step,badgeSources:data.badgeSources};
      }
    } catch { /* Optional upsell must never block the basket. */ }
    finally { clearTimeout(timer); }
    // An obsolete restaurant request must not open another restaurant's basket.
    if (opening.current !== attempt || latestScope.current !== scope || !continuation.current) return;
    setCartOpening(false);
    if (selected && latestKey.current === cartKey && !previousUpsellId && sessionId) {
      let hash=2166136261;
      for(const char of `${scope}/${sessionId}/${selected.upsell.id}`) hash=Math.imul(hash ^ char.charCodeAt(0),16777619);
      const control=(hash>>>0)%100 < Math.max(0,Math.min(50,Number((await lookup as any)?.controlPercent)||0));
      trackEvent('upsell_eligible', {upsellId:selected.upsell.id,locationId:location.id,experimentGroup:control?'control':'treatment'});
      if(control) selected=null;
    }
    if (selected && latestKey.current === cartKey) setPopup(selected);
    else { const next = continuation.current; continuation.current = null; pending.current = false; setPreviousUpsellId(undefined); next(); }
  };
  return <Catalog.Provider value={{products, combos, openCart, cartOpening}}>
    {children}
    {cartOpening && previousUpsellId && !popup && <Dialog open onOpenChange={open => { if (!open) finish(); }}>
      <DialogContent><DialogHeader><DialogTitle>Henter dit næste tilbud</DialogTitle>
        <DialogDescription>Vi undersøger, om der er lidt ekstra, der passer til din ordre.</DialogDescription>
      </DialogHeader><Button variant="outline" onClick={() => finish()}>{destination === 'checkout' ? 'Fortsæt til checkout' : 'Fortsæt til kurven'}</Button></DialogContent>
    </Dialog>}
    {popup && <UpsellDialog key={`${scope}/${popup.upsell.id}`} upsellData={popup} destination={destination} onContinue={finish} />}
  </Catalog.Provider>;
}
