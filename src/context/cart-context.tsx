

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
  voucherDiscount: { name: string, amount: number } | null;
  freeDeliveryDiscountApplied: boolean;
  applyDiscount: (discount: Discount) => void;
  removeDiscount: () => void;
  finalDiscount: { name: string, amount: number } | null; // For payment submission
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const isLockedItem = (item: CartItem) => item.itemType === 'combo';


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

  // States for calculated values
  const [subtotal, setSubtotal] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [automaticCartDiscount, setAutomaticCartDiscount] = useState<{ name: string; amount: number } | null>(null);
  const [voucherDiscount, setVoucherDiscount] = useState<{ name: string; amount: number } | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [freeDeliveryDiscountApplied, setFreeDeliveryDiscountApplied] = useState(false);
  const [bagFee, setBagFee] = useState(0);
  const [adminFee, setAdminFee] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const [vatAmount, setVatAmount] = useState(0);
  const [finalDiscount, setFinalDiscount] = useState<{ name: string; amount: number } | null>(null);


  useEffect(() => {
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
    setSelectedTime('asap');
  };
  
  const setCartContext = useCallback((newBrand: Brand, newLocation: Location) => {
    if (brand && location && (brand.id !== newBrand.id || location.id !== newLocation.id)) {
        setCartItems([]);
        setIncludeBagFee(true);
    }
    setBrand(newBrand);
    setLocation(newLocation);
    Cookies.set('of_location', newLocation.slug, { expires: 1/48, path: '/', sameSite: 'Lax' });
  }, [brand, location]);

  useEffect(() => {
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

    // This is the single source of truth for all cart calculations.
    // It runs whenever the underlying data changes.
    useEffect(() => {
        // 1. Calculate base values: subtotal and item count
        const currentSubtotal = cartItems.reduce((total, item) => {
            const toppingsPrice = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0);
            return total + (item.basePrice * item.quantity) + (toppingsPrice * item.quantity);
        }, 0);
        setSubtotal(currentSubtotal);
        setItemCount(cartItems.reduce((count, item) => count + item.quantity, 0));

        // 2. Calculate item-level discounts
        const currentItemDiscount = cartItems.reduce((total, item) => {
             const originalLinePrice = item.basePrice * item.quantity;
             const discountedLinePrice = item.price * item.quantity;
             return total + (originalLinePrice - discountedLinePrice);
        }, 0);
        setItemDiscount(currentItemDiscount);

        // 3. Calculate discountable subtotal for cart-level discounts
        const unlockedItems = cartItems.filter(item => !isLockedItem(item));
        const discountableSubtotal = unlockedItems.reduce((sum, item) => {
            const toppingsPrice = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0);
            return sum + ((item.basePrice + toppingsPrice) * item.quantity);
        }, 0);

        // 4. Calculate best automatic cart discount
        let bestAutoDiscount: { name: string, amount: number } | null = null;
        if (discountableSubtotal > 0) {
            const applicableCartDiscounts = standardDiscounts.filter(d => 
                d.discountType === 'cart' && discountableSubtotal >= (d.minOrderValue || 0)
            );

            if (applicableCartDiscounts.length > 0) {
                const bestAuto = applicableCartDiscounts.reduce((best, current) => {
                    const bestAmount = best.discountMethod === 'percentage' ? discountableSubtotal * ((best.discountValue || 0) / 100) : (best.discountValue || 0);
                    const currentAmount = current.discountMethod === 'percentage' ? discountableSubtotal * ((current.discountValue || 0) / 100) : (current.discountValue || 0);
                    return currentAmount > bestAmount ? current : best;
                });
                let amount = 0;
                if (bestAuto.discountMethod === 'percentage' && bestAuto.discountValue) {
                    amount = discountableSubtotal * (bestAuto.discountValue / 100);
                } else if (bestAuto.discountMethod === 'fixed_amount' && bestAuto.discountValue) {
                    amount = Math.min(discountableSubtotal, bestAuto.discountValue);
                }
                if (amount > 0) {
                    bestAutoDiscount = { name: bestAuto.discountName, amount };
                }
            }
        }
        setAutomaticCartDiscount(bestAutoDiscount);
        
        // 5. Calculate voucher discount
        let calculatedVoucher: { name: string, amount: number } | null = null;
        if (appliedDiscount && discountableSubtotal >= (appliedDiscount.minOrderValue || 0)) {
            let voucherAmount = 0;
            if (appliedDiscount.discountType === 'percentage') {
                voucherAmount = discountableSubtotal * (appliedDiscount.discountValue / 100);
            } else {
                voucherAmount = Math.min(discountableSubtotal, appliedDiscount.discountValue);
            }
            if (voucherAmount > 0) {
                calculatedVoucher = { name: appliedDiscount.code, amount: voucherAmount };
            }
        }
        setVoucherDiscount(calculatedVoucher);

        // 6. Determine which cart-level discount to apply (voucher vs automatic)
        const finalCartDiscount = (calculatedVoucher && (!bestAutoDiscount || calculatedVoucher.amount > bestAutoDiscount.amount))
            ? null // If voucher is better, we don't apply the automatic one.
            : bestAutoDiscount;
        const finalVoucherDiscount = (calculatedVoucher && (!bestAutoDiscount || calculatedVoucher.amount > bestAutoDiscount.amount))
            ? calculatedVoucher
            : null;
        
        // 7. Calculate Fees
        let currentDeliveryFee = 0;
        let isFreeDelivery = false;
        if (deliveryType === 'delivery' && location) {
            currentDeliveryFee = location.deliveryFee;
            const freeDeliveryDiscount = standardDiscounts.find(d => 
                d.discountType === 'free_delivery' && 
                (currentSubtotal - currentItemDiscount) >= (d.minOrderValue || 0)
            );
            if (freeDeliveryDiscount) {
                isFreeDelivery = true;
            }
        }
        setDeliveryFee(currentDeliveryFee);
        setFreeDeliveryDiscountApplied(isFreeDelivery);

        const currentBagFee = includeBagFee && brand?.bagFee ? brand.bagFee : 0;
        setBagFee(currentBagFee);

        // 8. Calculate Final Totals
        const totalDiscountFromCart = (finalCartDiscount?.amount || 0) + (finalVoucherDiscount?.amount || 0);
        const finalCartTotal = currentSubtotal - currentItemDiscount - totalDiscountFromCart;
        setCartTotal(Math.max(0, finalCartTotal));
        
        let finalCheckoutTotal = finalCartTotal;
        if (!isFreeDelivery) {
            finalCheckoutTotal += currentDeliveryFee;
        }
        finalCheckoutTotal += currentBagFee;

        // Admin fee is calculated on the total *after* all other discounts and fees
        let currentAdminFee = 0;
        if (brand?.adminFee && brand.adminFee > 0) {
            if (brand.adminFeeType === 'fixed') {
                currentAdminFee = brand.adminFee;
            } else if (brand.adminFeeType === 'percentage') {
                currentAdminFee = Math.max(0, finalCheckoutTotal) * (brand.adminFee / 100);
            }
        }
        setAdminFee(currentAdminFee);
        finalCheckoutTotal += currentAdminFee;
        
        setCheckoutTotal(Math.max(0, finalCheckoutTotal));

        const vatRate = brand?.vatPercentage || 25;
        setVatAmount((finalCheckoutTotal * vatRate) / (100 + vatRate));

        // 9. Consolidate discount info for display
        let totalDiscountAmount = currentItemDiscount + totalDiscountFromCart;
        if (isFreeDelivery) totalDiscountAmount += currentDeliveryFee;
        const allNames = [
            ...(currentItemDiscount > 0 ? ['Item Offers'] : []),
            ...(finalCartDiscount ? [finalCartDiscount.name] : []),
            ...(finalVoucherDiscount ? [finalVoucherDiscount.name] : []),
            ...(isFreeDelivery ? ['Free Delivery'] : []),
        ];
        setFinalDiscount({ name: allNames.join(' + '), amount: totalDiscountAmount });
        
    }, [cartItems, appliedDiscount, standardDiscounts, brand, location, deliveryType, includeBagFee]);


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
    cartDiscount: automaticCartDiscount,
    voucherDiscount,
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
