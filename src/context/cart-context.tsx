
'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Product, CartItemTopping, Brand, Location, ComboMenu, ComboSelection, Discount, StandardDiscount, CartItem, ProductForMenu } from '@/types';
import { restoreCartAction } from '@/app/cart-actions';
import { CART_STORAGE_KEY, cartChoices, readCartSnapshot, requestedDelivery, type CartSnapshot } from '@/lib/cart-snapshot';
import Cookies from 'js-cookie';
import { useSearchParams } from 'next/navigation';
import { syncDeliveryUrl } from '@/lib/delivery-url';
import { money, sumMoney, lineMoney } from '@/lib/money';
import { basketTotals } from '@/lib/basket-totals';
import { isLockedItem } from '@/lib/cart-utils';

interface CartContextType {
  cartReady: boolean;
  saveCartForCheckout: (orderId: string) => void;
  completeCheckout: (orderId: string, brandId: string, locationId: string) => void;
  cartItems: CartItem[];
  brand: Brand | null;
  location: Location | null;
  deliveryType: 'delivery' | 'pickup' | null;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
  deliveryFee: number;
  bagFee: number;
  adminFee: number;
  vatAmount: number;
  includeBagFee: boolean;
  toggleBagFee: (include: boolean) => void;
  setDeliveryType: (type: 'delivery' | 'pickup') => void;
  addToCart: (product: ProductForMenu, quantity: number, toppings: CartItemTopping[], basePrice: number, finalPrice: number) => void;
  addComboToCart: (combo: ComboMenu, quantity: number, selections: ComboSelection[], price: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, newQuantity: number) => void;
  clearCart: () => void;
  setCartContext: (brand: Brand, location: Location, seed?: {deliveryType: 'pickup' | 'delivery'; discounts: StandardDiscount[]}) => void;
  recalculateAndValidateDiscount: () => void;
  cartTotal: number;
  checkoutTotal: number;
  itemCount: number;
  subtotal: number;
  appliedDiscount: Discount | null;
  standardDiscounts: StandardDiscount[];
  itemDiscount: number;
  cartDiscount: { name: string, amount: number } | null;
  voucherDiscount: { name: string, amount: number } | null;
  freeDeliveryDiscountApplied: boolean;
  applyDiscount: (discount: Discount) => void;
  removeDiscount: () => void;
  finalDiscount: { name: string; amount: number } | null; // For payment submission
}

const CartContext = createContext<CartContextType | undefined>(undefined);


export function CartProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [deliveryType, setDeliveryTypeState] = useState<'delivery' | 'pickup' | null>(null);
  const [selectedTime, setSelectedTime] = useState('asap');
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(null);
  const [standardDiscounts, setStandardDiscounts] = useState<StandardDiscount[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [includeBagFee, setIncludeBagFee] = useState(true);
  const snapshotRef = useRef<CartSnapshot | null>(null);
  const checkoutOrderId = useRef<string>();
  const scopeRef = useRef('');
  const seedRef = useRef<{key: string; discounts: StandardDiscount[]} | null>(null);
  const readyRef = useRef(false);
  const generation = useRef(0);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const contextKey = brand && location && deliveryType ? `${brand.id}/${location.id}/${deliveryType}` : '';
  const cartReady = !!contextKey && readyKey === contextKey;
  const current = useRef({ cartItems, brand, location, deliveryType, includeBagFee });
  current.current = { cartItems, brand, location, deliveryType, includeBagFee };

  const persist = useCallback(() => {
    if (!readyRef.current) return;
    const state = current.current;
    if (!state.brand || !state.location || !state.deliveryType) return;
    const snapshot: CartSnapshot = {
      version: 1, brandId: state.brand.id, locationId: state.location.id,
      deliveryType: state.deliveryType, includeBagFee: state.includeBagFee,
      choices: cartChoices(state.cartItems), savedAt: Date.now(),
      ...(checkoutOrderId.current ? { checkoutOrderId: checkoutOrderId.current } : {}),
    };
    snapshotRef.current = snapshot;
    try {
      if (snapshot.choices.length) localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot));
      else localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      setCartNotice('Browseren kan ikke gemme kurven. Den kan derfor gå tabt, hvis du forlader siden.');
    }
  }, []);

  useEffect(() => {
    const deliveryMethodFromUrl = requestedDelivery(window.location.search);

    let savedDeliveryMethod: 'delivery' | 'pickup' | null = null;
    try {
      snapshotRef.current = readCartSnapshot(localStorage);
      const savedValue = localStorage.getItem('deliveryMethod');
      if (savedValue === 'delivery' || savedValue === 'pickup') {
        savedDeliveryMethod = savedValue;
      }
    } catch {
      // Browser storage can be unavailable. The URL remains authoritative.
    }

    const initialDeliveryMethod = deliveryMethodFromUrl ?? snapshotRef.current?.deliveryType ?? savedDeliveryMethod ?? 'pickup';
    if (initialDeliveryMethod) {
      setDeliveryTypeState(initialDeliveryMethod);
    }

    if (deliveryMethodFromUrl) {
      try {
        localStorage.setItem('deliveryMethod', deliveryMethodFromUrl);
      } catch {
        // State still keeps the URL selection for this session.
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    const onNavigation = () => { const requested = requestedDelivery(window.location.search); if (requested) setDeliveryType(requested); };
    window.addEventListener('popstate', onNavigation);
    return () => window.removeEventListener('popstate', onNavigation);
  });

  const requestedMode = requestedDelivery(`?${searchParams.toString()}`);
  useEffect(() => {
    if (isInitialized && requestedMode) setDeliveryType(requestedMode);
  }, [requestedMode, isInitialized]);

  const toggleBagFee = (include: boolean) => {
    if (current.current.includeBagFee === include) return;
    checkoutOrderId.current = undefined;
    persist(); // Invalidate the old payment in shared storage before the state update.
    setIncludeBagFee(include);
  };

  const setDeliveryType = (type: 'delivery' | 'pickup') => {
    syncDeliveryUrl(type);
    if (current.current.deliveryType === type) return;
    checkoutOrderId.current = undefined;
    persist();
    generation.current++;
    readyRef.current = false;
    setReadyKey(null);
    try {
      localStorage.setItem('deliveryMethod', type);
    } catch {
      // Keep the in-memory selection when browser storage is unavailable.
    }
    setDeliveryTypeState(type);
    setAppliedDiscount(null);
    setSelectedTime('asap');
  };
  
  const setCartContext = useCallback((newBrand: Brand, newLocation: Location, seed?: {deliveryType: 'pickup' | 'delivery'; discounts: StandardDiscount[]}) => {
    const key = `${newBrand.id}/${newLocation.id}`;
    if (scopeRef.current === key) return;
    scopeRef.current = key;
    seedRef.current = seed ? {key: `${key}/${seed.deliveryType}`, discounts: seed.discounts} : null;
    generation.current++;
    readyRef.current = false;
    setReadyKey(null);
    setAppliedDiscount(null);
    setCartItems([]);
    setStandardDiscounts([]);
    setIncludeBagFee(true);
    setSelectedTime('asap');
    setBrand(newBrand);
    setLocation(newLocation);
    try { Cookies.set('of_location', newLocation.slug, { expires: 1/48, path: '/', sameSite: 'Lax' }); } catch { /* Context remains in memory. */ }
  }, []);

  const recalculateAndValidateDiscount = useCallback(() => {
    // Totals are derived synchronously below.
    // The function is kept for API compatibility but can be removed later if unused.
  }, []);


  useEffect(() => {
    if (!isInitialized || !brand || !location || !deliveryType) return;
    const request = ++generation.current;
    readyRef.current = false;
    setReadyKey(null);
    setRestoreError(false);
    const saved = snapshotRef.current;
    const matching = saved?.brandId === brand.id && saved.locationId === location.id ? saved : null;
    const seed = seedRef.current;
    const restoration = !matching?.choices.length && seed?.key === contextKey
      ? Promise.resolve({items: [], removed: 0, discounts: seed.discounts})
      : restoreCartAction({ brandId: brand.id, locationId: location.id, deliveryType, choices: matching?.choices || [] });
    restoration
      .then(result => {
        if (generation.current !== request) return;
        seedRef.current = null;
        setCartItems(result.items);
        setStandardDiscounts(result.discounts);
        setIncludeBagFee(matching?.includeBagFee ?? true);
        checkoutOrderId.current = matching?.checkoutOrderId;
        setCartNotice(result.removed ? 'Nogle varer eller tilvalg er ikke længere tilgængelige og er fjernet. Kontrollér kurven før betaling.' : '');
        readyRef.current = true;
        setReadyKey(contextKey);
      }).catch(() => {
        if (generation.current === request) setRestoreError(true);
      });
    return () => { generation.current++; };
  }, [brand?.id, location?.id, deliveryType, isInitialized, retry]);

  useEffect(() => {
    if (cartReady) persist();
  }, [cartItems, includeBagFee, cartReady, persist]);

  const saveCartForCheckout = useCallback((orderId: string) => {
    checkoutOrderId.current = orderId;
    persist(); // Flush before leaving the application for Stripe.
  }, [persist]);

  const completeCheckout = useCallback((orderId: string, brandId: string, locationId: string) => {
    let saved = snapshotRef.current;
    try { saved = readCartSnapshot(localStorage); } catch { /* In-memory fallback. */ }
    if (saved?.checkoutOrderId !== orderId || saved.brandId !== brandId || saved.locationId !== locationId) return;
    generation.current++;
    snapshotRef.current = null;
    checkoutOrderId.current = undefined;
    try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* Browser storage is unavailable. */ }
    setCartItems([]);
    setAppliedDiscount(null);
    setIncludeBagFee(true);
  }, []);

  const { subtotal, itemCount, itemDiscount, automaticCartDiscount, voucherDiscount, deliveryFee, freeDeliveryDiscountApplied, bagFee, adminFee, cartTotal, checkoutTotal, vatAmount, finalDiscount } = useMemo(() => {
    return basketTotals({cartItems, appliedDiscount, standardDiscounts, deliveryType, location, brand, includeBagFee});

  }, [cartItems, appliedDiscount, standardDiscounts, deliveryType, location, isInitialized, brand, includeBagFee]);


  const addToCart = useCallback((product: ProductForMenu, quantity: number, toppings: CartItemTopping[], basePrice: number, finalPrice: number) => {
    if (!readyRef.current) return;
    checkoutOrderId.current = undefined;
    const canonicalizeToppings = (values: CartItemTopping[]) => [...values].sort((a, b) => {
      if (a.id && b.id) {
        const identityOrder = a.id.localeCompare(b.id);
        if (identityOrder !== 0) return identityOrder;
        return a.price - b.price;
      }
      if (a.id) return -1;
      if (b.id) return 1;
      const nameOrder = a.name.localeCompare(b.name);
      if (nameOrder !== 0) return nameOrder;
      return a.price - b.price;
    });
    basePrice = money(basePrice); finalPrice = money(finalPrice);
    const sortedToppings = canonicalizeToppings(toppings.map(t => ({...t, price: money(t.price)})));
    const toppingsKey = sortedToppings.map(t => `${t.id || t.name}:${t.price}`).join(',');
    const existingItemKey = `${product.id}-${toppingsKey}`;
  
    const toppingsTotal = sortedToppings.reduce((sum, t) => sum + t.price, 0);
    const itemTotal = sumMoney([finalPrice, toppingsTotal]);
  
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.itemType === 'product' && `${item.id}-${canonicalizeToppings(item.toppings).map(t => `${t.id || t.name}:${t.price}`).join(',')}` === existingItemKey);
  
      if (existingItem) {
        return prevItems.map(item =>
          item.cartItemId === existingItem.cartItemId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        const newCartItem: CartItem = {
          id: product.id,
          cartItemId: `${product.id}-${Date.now()}`,
          itemType: 'product',
          productName: product.productName,
          description: product.description,
          imageUrl: product.imageUrl,
          basePrice: basePrice,
          price: finalPrice,
          quantity,
          toppings: sortedToppings,
          itemTotal,
          categoryId: product.categoryId,
          tags: [
            ...(product.isPopular ? ['Popular'] : []),
            ...(product.isFeatured ? ['Recommended'] : []),
            ...(product.isNew ? ['Campaign'] : []),
          ],
          brandId: product.brandId,
        };
        return [...prevItems, newCartItem];
      }
    });
  }, []);

  const addComboToCart = useCallback((combo: ComboMenu, quantity: number, selections: ComboSelection[], price: number) => {
      if (!readyRef.current) return;
      checkoutOrderId.current = undefined;
      price = money(price);
      const newCartItem: CartItem = {
          id: combo.id,
          cartItemId: `${combo.id}-${Date.now()}`,
          itemType: 'combo',
          productName: combo.comboName,
          description: combo.description,
          imageUrl: combo.imageUrl || undefined,
          basePrice: price,
          price: price,
          quantity: quantity,
          itemTotal: price,
          toppings: [],
          brandId: combo.brandId,
          comboSelections: selections,
      };
      setCartItems(prev => [...prev, newCartItem]);
  }, []);
  
  const removeFromCart = useCallback((cartItemId: string) => {
    if (!readyRef.current) return;
    checkoutOrderId.current = undefined;
    setCartItems(prevItems => prevItems.filter(item => item.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, newQuantity: number) => {
    if (!readyRef.current) return;
    checkoutOrderId.current = undefined;
    if (newQuantity <= 0) {
      removeFromCart(cartItemId);
    } else {
      setCartItems(prevItems =>
        prevItems.map(item =>
          item.cartItemId === cartItemId ? { ...item, quantity: newQuantity } : item
        )
      );
    }
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    if (!readyRef.current) return;
    generation.current++;
    snapshotRef.current = null;
    checkoutOrderId.current = undefined;
    try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* In-memory cart still clears. */ }
    setCartItems([]);
    setAppliedDiscount(null);
    setIncludeBagFee(true);
  }, []);

  const applyDiscount = useCallback((discount: Discount) => {
    setAppliedDiscount(discount);
  }, []);

  const removeDiscount = useCallback(() => {
    setAppliedDiscount(null);
  }, []);

  const value = {
    cartReady,
    saveCartForCheckout,
    completeCheckout,
    cartItems,
    brand,
    location,
    deliveryType,
    selectedTime,
    setSelectedTime,
    deliveryFee,
    bagFee,
    adminFee,
    vatAmount,
    includeBagFee,
    toggleBagFee,
    setDeliveryType,
    setCartContext,
    recalculateAndValidateDiscount,
    addToCart,
    addComboToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    subtotal,
    cartTotal,
    checkoutTotal,
    itemCount,
    appliedDiscount,
    standardDiscounts,
    itemDiscount,
    cartDiscount: automaticCartDiscount,
    voucherDiscount,
    freeDeliveryDiscountApplied,
    applyDiscount,
    removeDiscount,
    finalDiscount,
  };

  return <CartContext.Provider value={value}>
    {children}
    {contextKey && !cartReady && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-6" role="status" aria-live="polite">
      {restoreError ? <div className="text-center">
        <p>Kurven kunne ikke indlæses. Prøv igen for at hente aktuelle priser.</p>
        <button className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => setRetry(value => value + 1)}>Prøv igen</button>
      </div> : <span className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-label="Indlæser" />}
    </div>}
    {cartReady && cartNotice && <div role="status" className="fixed bottom-4 left-4 right-4 z-[90] rounded border bg-background p-4 shadow-lg">
      {cartNotice}<button className="ml-4 underline" onClick={() => setCartNotice('')}>Luk</button>
    </div>}
  </CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
