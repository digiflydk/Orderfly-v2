

'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import type { Product, CartItemTopping, Brand, Location, ComboMenu, ComboSelection, Discount, StandardDiscount, CartItem, ProductForMenu } from '@/types';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import Cookies from 'js-cookie';


interface CartContextType {
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
  setCartContext: (brand: Brand, location: Location) => void;
  cartTotal: number;
  checkoutTotal: number;
  itemCount: number;
  subtotal: number;
  appliedDiscount: Discount | null;
  standardDiscounts: StandardDiscount[];
  itemDiscount: number;
  cartDiscount: { name: string, amount: number } | null;
  freeDeliveryDiscountApplied: boolean;
  applyDiscount: (discount: Discount) => void;
  removeDiscount: () => void;
  finalDiscount: { name: string, amount: number } | null; // For payment submission
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// An item's price is "locked" if it's a combo or has an individual offer applied.
const isLockedItem = (item: CartItem) => item.itemType === 'combo' || item.basePrice > item.price;


export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [deliveryType, setDeliveryTypeState] = useState<'delivery' | 'pickup' | null>(null);
  const [selectedTime, setSelectedTime] = useState('asap');
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(null);
  const [standardDiscounts, setStandardDiscounts] = useState<StandardDiscount[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [includeBagFee, setIncludeBagFee] = useState(true);

  useEffect(() => {
    // This effect runs once on mount to initialize from localStorage
    const savedDeliveryMethod = localStorage.getItem('deliveryMethod') as 'delivery' | 'pickup' | null;
    if (savedDeliveryMethod) {
      setDeliveryTypeState(savedDeliveryMethod);
    }
    setIsInitialized(true);
  }, []);

  const toggleBagFee = (include: boolean) => {
    setIncludeBagFee(include);
  };

  const setDeliveryType = (type: 'delivery' | 'pickup') => {
    localStorage.setItem('deliveryMethod', type);
    setDeliveryTypeState(type);
    setSelectedTime('asap'); // Reset time selection on delivery type change
  };
  
  const setCartContext = useCallback((newBrand: Brand, newLocation: Location) => {
    // Only clear the cart if the brand/location *actually* changes from a previously set one.
    if (brand && location && (brand.id !== newBrand.id || location.id !== newLocation.id)) {
        setCartItems([]);
        setIncludeBagFee(true);
    }

    setBrand(newBrand);
    setLocation(newLocation);
    
    // Persist location slug to a cookie for cross-page navigation
    Cookies.set('of_location', newLocation.slug, { expires: 1/48, path: '/', sameSite: 'Lax' });
  }, [brand, location]);

  useEffect(() => {
    // This effect runs on the client to fetch discounts when necessary.
    // It's separate from the context setting to avoid state conflicts.
    async function fetchDiscounts() {
      if (isInitialized && brand && location && deliveryType) {
        const activeDiscounts = await getActiveStandardDiscounts({
          brandId: brand.id,
          locationId: location.id,
          deliveryType,
        });
        setStandardDiscounts(activeDiscounts);
      }
    }
    fetchDiscounts();
  }, [deliveryType, brand, location, isInitialized]);


  const addToCart = useCallback((product: ProductForMenu, quantity: number, toppings: CartItemTopping[], basePrice: number, finalPrice: number) => {
    const sortedToppings = [...toppings].sort((a, b) => a.name.localeCompare(b.name));
    const toppingsKey = sortedToppings.map(t => `${t.name}:${t.price}`).join(',');
    const existingItemKey = `${product.id}-${toppingsKey}`;
  
    const toppingsTotal = sortedToppings.reduce((sum, t) => sum + t.price, 0);
    const itemTotal = finalPrice + toppingsTotal;
  
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.itemType === 'product' && `${item.id}-${item.toppings.map(t => `${t.name}:${t.price}`).join(',')}` === existingItemKey);
  
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
          brandId: product.brandId,
        };
        return [...prevItems, newCartItem];
      }
    });
  }, []);

  const addComboToCart = useCallback((combo: ComboMenu, quantity: number, selections: ComboSelection[], price: number) => {
      const newCartItem: CartItem = {
          id: combo.id,
          cartItemId: `${combo.id}-${Date.now()}`,
          itemType: 'combo',
          productName: combo.comboName,
          description: combo.description,
          imageUrl: combo.imageUrl || undefined,
          basePrice: price, // For combos, base and final price are the same initially
          price: price,
          quantity: quantity,
          itemTotal: price,
          toppings: [], // Combos don't have toppings in this model
          brandId: combo.brandId,
          comboSelections: selections,
      };
      setCartItems(prev => [...prev, newCartItem]);
  }, []);
  
  const removeFromCart = useCallback((cartItemId: string) => {
    setCartItems(prevItems => prevItems.filter(item => item.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, newQuantity: number) => {
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
  
  // Base subtotal calculation using basePrice
  const subtotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
        const toppingsPrice = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0) * item.quantity;
        return total + item.basePrice * item.quantity + toppingsPrice;
    }, 0);
  }, [cartItems]);

  // Total discount from standard offers on items
  const itemDiscount = useMemo(() => {
      return cartItems.reduce((total, item) => {
          const originalLinePrice = item.basePrice * item.quantity;
          const discountedLinePrice = item.price * item.quantity;
          return total + (originalLinePrice - discountedLinePrice);
      }, 0);
  }, [cartItems]);
  
  // Calculate cart-level discount (either automatic or from a voucher)
  const cartDiscount = useMemo(() => {
    const unlockedItems = cartItems.filter(item => !isLockedItem(item));
    const discountableSubtotal = unlockedItems.reduce((sum, item) => {
      const toppingsPrice = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0);
      return sum + (item.basePrice + toppingsPrice) * item.quantity;
    }, 0);

    if (discountableSubtotal === 0) return null;
    
    let bestCartLevelDiscountAmount = 0;
    let bestCartLevelDiscountName = '';
    
    const cartDiscounts = standardDiscounts.filter(d => 
        d.discountType === 'cart' && 
        discountableSubtotal >= (d.minOrderValue || 0)
    );

    if (cartDiscounts.length > 0) {
        const autoCartDiscount = cartDiscounts[0]; 
        if (autoCartDiscount.discountMethod === 'percentage' && autoCartDiscount.discountValue) {
            bestCartLevelDiscountAmount = discountableSubtotal * (autoCartDiscount.discountValue / 100);
        } else if (autoCartDiscount.discountMethod === 'fixed_amount' && autoCartDiscount.discountValue) {
            bestCartLevelDiscountAmount = Math.min(discountableSubtotal, autoCartDiscount.discountValue);
        }
        bestCartLevelDiscountName = autoCartDiscount.discountName;
    }

    if (appliedDiscount && discountableSubtotal >= (appliedDiscount.minOrderValue || 0)) {
        let voucherAmount = 0;
        if (appliedDiscount.discountType === 'percentage') {
            voucherAmount = discountableSubtotal * (appliedDiscount.discountValue / 100);
        } else {
            voucherAmount = Math.min(discountableSubtotal, appliedDiscount.discountValue);
        }
        if(voucherAmount > bestCartLevelDiscountAmount) {
            bestCartLevelDiscountAmount = voucherAmount;
            bestCartLevelDiscountName = appliedDiscount.code;
        }
    }
    
    if (bestCartLevelDiscountAmount > 0) {
        return { name: bestCartLevelDiscountName, amount: bestCartLevelDiscountAmount };
    }

    return null;
  }, [cartItems, standardDiscounts, appliedDiscount]);


  const { deliveryFee, freeDeliveryDiscountApplied } = useMemo(() => {
    if (deliveryType === 'delivery' && location) {
        const totalAfterItemDiscounts = subtotal - itemDiscount;
        const freeDeliveryDiscount = standardDiscounts.find(d => 
            d.discountType === 'free_delivery' && 
            totalAfterItemDiscounts >= (d.minOrderValue || 0)
        );

        if (freeDeliveryDiscount) {
            return { deliveryFee: location.deliveryFee, freeDeliveryDiscountApplied: true };
        }
        return { deliveryFee: location.deliveryFee, freeDeliveryDiscountApplied: false };
    }
    return { deliveryFee: 0, freeDeliveryDiscountApplied: false };
  }, [deliveryType, location, standardDiscounts, subtotal, itemDiscount]);

  const bagFee = useMemo(() => {
      return includeBagFee && brand?.bagFee ? brand.bagFee : 0;
  }, [includeBagFee, brand]);

  const itemCount = useMemo(() => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  }, [cartItems]);
  
  const cartTotal = useMemo(() => {
    let finalTotal = subtotal - itemDiscount - (cartDiscount?.amount || 0);
    return Math.max(0, finalTotal);
  }, [subtotal, itemDiscount, cartDiscount]);

  const adminFee = useMemo(() => {
    if (!brand?.adminFee || brand.adminFee <= 0) return 0;
    const baseForFee = cartTotal + (freeDeliveryDiscountApplied ? 0 : deliveryFee) + bagFee;
    if (brand.adminFeeType === 'fixed') {
        return brand.adminFee;
    }
    if (brand.adminFeeType === 'percentage') {
        return baseForFee * (brand.adminFee / 100);
    }
    return 0;
  }, [brand, cartTotal, deliveryFee, bagFee, freeDeliveryDiscountApplied]);

  const checkoutTotal = useMemo(() => {
      return cartTotal + (freeDeliveryDiscountApplied ? 0 : deliveryFee) + bagFee + adminFee;
  }, [cartTotal, freeDeliveryDiscountApplied, deliveryFee, bagFee, adminFee]);
  
  const vatAmount = useMemo(() => {
      const vatRate = brand?.vatPercentage || 25;
      return (checkoutTotal * vatRate) / (100 + vatRate);
  }, [checkoutTotal, brand?.vatPercentage]);

  const finalDiscount = useMemo(() => {
      let totalDiscount = itemDiscount + (cartDiscount?.amount || 0);
      if (freeDeliveryDiscountApplied) {
          totalDiscount += deliveryFee;
      }
      return { name: "Total Discounts", amount: totalDiscount };
  }, [itemDiscount, cartDiscount, freeDeliveryDiscountApplied, deliveryFee]);


  const value = {
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
    cartDiscount,
    freeDeliveryDiscountApplied,
    applyDiscount,
    removeDiscount,
    finalDiscount,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
