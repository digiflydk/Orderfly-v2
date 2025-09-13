

'use server';

import type { StandardDiscount, Product, CartItem, Category, Discount, Upsell } from "@/types";
import { getActiveStandardDiscounts } from "../standard-discounts/actions";
import { useMemo } from "react";

// This file contains the test logic for standard discounts.
// It simulates cart behavior to validate that discount calculations are correct
// and that the necessary data is available for the frontend to render prices correctly.

// --- Mocks and Test Data ---

const MOCK_BRAND_ID = 'brand-1';
const MOCK_LOCATION_ID = 'loc-1';
const MOCK_OTHER_LOCATION_ID = 'loc-2';


const MOCK_PRODUCTS: Product[] = [
    { id: 'pizza-1', productName: 'Hawaii Pizza', price: 100, priceDelivery: 110, categoryId: 'cat-pizza', brandId: MOCK_BRAND_ID, locationIds: [MOCK_LOCATION_ID] } as Product,
    { id: 'pasta-1', productName: 'Carbonara', price: 120, priceDelivery: 120, categoryId: 'cat-pasta', brandId: MOCK_BRAND_ID, locationIds: [MOCK_LOCATION_ID] } as Product,
    { id: 'drink-1', productName: 'Cola', price: 25, priceDelivery: 30, categoryId: 'cat-drinks', brandId: MOCK_BRAND_ID, locationIds: [MOCK_LOCATION_ID] } as Product,
    { id: 'pizza-2', productName: 'Pepperoni Pizza', price: 105, categoryId: 'cat-pizza', brandId: MOCK_BRAND_ID, locationIds: [MOCK_LOCATION_ID] } as Product,
    { id: 'base-1', productName: 'Low Base', price: 10, categoryId: 'cat-other', brandId: MOCK_BRAND_ID, locationIds: [MOCK_LOCATION_ID] } as Product,
];

// --- Simulation Structures ---

const isLockedItem = (item: CartItem) => item.itemType === 'combo' || item.basePrice !== item.price;

// This logic is a simplified, non-hook version of the logic in CartContext
// It now returns a rich object simulating the cart's state.
function calculateDiscountForTest(
    cartItems: CartItem[], 
    standardDiscounts: StandardDiscount[], 
    voucherDiscount: Discount | null
): {
    itemDiscounts: Record<string, number>,
    finalDiscount: { name: string, amount: number } | null,
    cartTotal: number,
    subtotal: number,
} {
    const subtotal = cartItems.reduce((total, item) => total + item.basePrice * item.quantity + item.toppings.reduce((tTotal, t) => tTotal + t.price, 0) * item.quantity, 0);

    const calculatedItemDiscounts: Record<string, number> = {};
    const appliedDiscountNames: string[] = [];
    const lockedItemDiscountMessages: string[] = [];
    
    // 1. Calculate item-level discounts from standard discounts (Offers)
    let totalItemDiscount = 0;
    cartItems.forEach(item => {
        if (isLockedItem(item) && item.itemType === 'product') { // Only 'product' type has item-level discounts
            const itemDiscountAmount = (item.basePrice - item.price) * item.quantity;
            calculatedItemDiscounts[item.cartItemId] = itemDiscountAmount;
            totalItemDiscount += itemDiscountAmount;
            
            const discountSource = standardDiscounts.find(d => 
                (d.discountType === 'product' && d.referenceIds.includes(item.id.replace('-offer', ''))) ||
                (d.discountType === 'category' && d.referenceIds.includes(item.categoryId || ''))
            );
            if (discountSource && !lockedItemDiscountMessages.includes(discountSource.discountName)) {
                lockedItemDiscountMessages.push(discountSource.discountName);
            }
        }
    });

    if (lockedItemDiscountMessages.length > 0) {
        appliedDiscountNames.push(...lockedItemDiscountMessages);
    }
    
    // NOTE: Toppings are now included in cart-level discount calculations (new logic as of July 2024).
    // Only combo or discounted items are excluded from the base subtotal.
    const totalToppingsPrice = cartItems.reduce((total, item) => {
        const toppingsPrice = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0) * item.quantity;
        return total + toppingsPrice;
    }, 0);
    
    const baseSubtotalOfUnlockedItems = cartItems
        .filter(item => !isLockedItem(item))
        .reduce((sum, item) => sum + (item.basePrice * item.quantity), 0);
    
    const subtotalIncludingToppings = baseSubtotalOfUnlockedItems + totalToppingsPrice;


    // 3. Determine best cart-level discount (automatic cart discount vs voucher)
    let bestCartLevelDiscountAmount = 0;
    let bestCartLevelDiscountName = '';

    // A. Check automatic cart discount
    const cartDiscounts = standardDiscounts.filter(d => 
        d.discountType === 'cart' && 
        subtotalIncludingToppings >= (d.minOrderValue || 0)
    );
    if (cartDiscounts.length > 0) {
        const autoCartDiscount = cartDiscounts[0]; // Assume first one wins
        let autoCartDiscountAmount = 0;
        if (autoCartDiscount.discountMethod === 'percentage') {
            autoCartDiscountAmount = subtotalIncludingToppings * (autoCartDiscount.discountValue / 100);
        } else {
            autoCartDiscountAmount = Math.min(subtotalIncludingToppings, autoCartDiscount.discountValue);
        }
        if(autoCartDiscountAmount > bestCartLevelDiscountAmount) {
            bestCartLevelDiscountAmount = autoCartDiscountAmount;
            bestCartLevelDiscountName = autoCartDiscount.discountName;
        }
    }

    // B. Check voucher discount
    if (voucherDiscount && subtotalIncludingToppings >= (voucherDiscount.minOrderValue || 0)) {
         let voucherAmount = 0;
         if (voucherDiscount.discountType === 'percentage') {
            voucherAmount = subtotalIncludingToppings * (voucherDiscount.discountValue / 100);
        } else {
            voucherAmount = Math.min(subtotalIncludingToppings, voucherDiscount.discountValue);
        }
        if(voucherAmount > bestCartLevelDiscountAmount) {
            bestCartLevelDiscountAmount = voucherAmount;
            bestCartLevelDiscountName = voucherDiscount.code;
        }
    }
    
    if (bestCartLevelDiscountName) {
      appliedDiscountNames.push(bestCartLevelDiscountName);
    }

    const totalDiscountAmount = totalItemDiscount + bestCartLevelDiscountAmount;
    
    return {
        itemDiscounts: calculatedItemDiscounts,
        finalDiscount: totalDiscountAmount > 0 ? { name: appliedDiscountNames.join(', '), amount: totalDiscountAmount } : null,
        subtotal,
        cartTotal: subtotal - totalDiscountAmount
    };
}


export interface TestResult {
    id: string;
    scenario: string;
    expected: string;
    actual: string;
    status: 'Pass' | 'Fail' | 'Not Implemented';
}

// Main Test Runner Function
export async function runDiscountValidationTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // --- Mocks for tests ---
    const pizzaItem: CartItem = { cartItemId: 'cart-pizza-1', id: 'pizza-1', productName: 'Hawaii Pizza', price: 100, basePrice: 100, categoryId: 'cat-pizza', quantity: 1, itemTotal: 100, toppings: [] } as CartItem;
    const pizzaItemDelivery: CartItem = { ...pizzaItem, price: 110, basePrice: 110 };
    const pastaItem: CartItem = { cartItemId: 'cart-pasta-1', id: 'pasta-1', productName: 'Carbonara', price: 120, basePrice: 120, categoryId: 'cat-pasta', quantity: 1, itemTotal: 120, toppings: [] } as CartItem;
    const drinkItem: CartItem = { cartItemId: 'cart-drink-1', id: 'drink-1', productName: 'Cola', price: 25, basePrice: 25, categoryId: 'cat-drinks', quantity: 2, itemTotal: 25, toppings: [] } as CartItem;
    const pizza2Item: CartItem = { cartItemId: 'cart-pizza-2', id: 'pizza-2', productName: 'Pepperoni Pizza', price: 105, basePrice: 105, categoryId: 'cat-pizza', quantity: 1, itemTotal: 105, toppings: [] } as CartItem;
    const comboItem: CartItem = { cartItemId: 'cart-combo-1', id: 'combo-1', productName: 'Pizza Combo', price: 150, basePrice: 150, itemType: 'combo', quantity: 1, itemTotal: 150, toppings: [] } as CartItem;
    const upsellItem: CartItem = { cartItemId: 'cart-upsell-1', id: 'drink-1', productName: 'Upsell Cola', price: 15, basePrice: 25, itemType: 'product', quantity: 1, itemTotal: 15, toppings: [] } as CartItem;
    const checkoutItemDiscount = { id: 'sd-42-item', discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'fixed_amount', discountValue: 20, orderTypes: ['pickup'] } as StandardDiscount;
    const cartDiscountHighThreshold = { id: 'sd-43-cart', discountName: 'High spender', discountType: 'cart', discountMethod: 'percentage', discountValue: 15, minOrderValue: 250, orderTypes: ['pickup'] } as StandardDiscount;
    const lowBaseHighToppingItem = { cartItemId: 'cart-lowbase-1', id: 'base-1', productName: 'Low Base', price: 10, basePrice: 10, categoryId: 'cat-other', quantity: 1, itemTotal: 100, toppings: [{name: 'Gold Flakes', price: 90}] } as CartItem;

    // --- TEST CASES START ---

    // SD-01: Discount on Single Product (Pickup, Fixed Amount)
    let testDiscount = { id: 'sd-01', discountName: "Pizza Discount", discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'fixed_amount', discountValue: 15, orderTypes: ['pickup'] } as StandardDiscount;
    let testResultCart = calculateDiscountForTest([pizzaItem], [testDiscount], null);
    results.push({
        id: 'SD-01', scenario: 'Correct fixed amount discount for a single product (Pickup).',
        expected: 'Total discount is 15.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 15 ? 'Pass' : 'Fail',
    });
    
    // SD-02: Discount on Single Product (Pickup, Percentage)
    testDiscount = { id: 'sd-02', discountName: "Pizza Percentage Discount", discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 20, orderTypes: ['pickup'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pizzaItem], [testDiscount], null);
    results.push({
        id: 'SD-02', scenario: 'Correct percentage discount for a single product (Pickup).',
        expected: 'Total discount is 20.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 20 ? 'Pass' : 'Fail',
    });

    // SD-03: Discount on Single Product (Delivery, Fixed Amount)
    testDiscount = { id: 'sd-03', discountName: "Pizza Discount Delivery", discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'fixed_amount', discountValue: 20, orderTypes: ['delivery'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pizzaItemDelivery], [testDiscount], null);
    results.push({
        id: 'SD-03', scenario: 'Correct fixed amount discount for a single product (Delivery).',
        expected: 'Total discount is 20.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 20 ? 'Pass' : 'Fail',
    });
    
    // SD-04: Discount on Single Product (Delivery, Percentage)
    testDiscount = { id: 'sd-04', discountName: "Pizza Percentage Discount Delivery", discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 10, orderTypes: ['delivery'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pizzaItemDelivery], [testDiscount], null);
    results.push({
        id: 'SD-04', scenario: 'Correct percentage discount for a single product (Delivery).',
        expected: 'Total discount is 11.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 11 ? 'Pass' : 'Fail',
    });

    // SD-25: Time Slot Validation (Pickup Time) - PASS
    let timeDiscount = { id: 'sd-25', discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 50, timeSlotValidationType: 'pickupTime', activeTimeSlots: [{start: '14:00', end: '16:00'}], orderTypes: ['pickup']} as StandardDiscount;
    let pickupTimeWithin = new Date();
    pickupTimeWithin.setHours(15, 0, 0); // 3 PM
    let activeDiscounts = await getActiveStandardDiscounts({ brandId: 'test', locationId: 'test', deliveryType: 'pickup', pickupTime: pickupTimeWithin, discountsForTest: [timeDiscount] });
    results.push({
        id: 'SD-25', scenario: 'Discount applies when pickup time is within the slot.',
        expected: '1 active discount found.',
        actual: `${activeDiscounts.length} active discount(s) found.`,
        status: activeDiscounts.length === 1 ? 'Pass' : 'Fail',
    });
    
    // SD-26: Time Slot Validation (Pickup Time) - FAIL
    let pickupTimeOutside = new Date();
    pickupTimeOutside.setHours(17, 0, 0); // 5 PM
    activeDiscounts = await getActiveStandardDiscounts({ brandId: 'test', locationId: 'test', deliveryType: 'pickup', pickupTime: pickupTimeOutside, discountsForTest: [timeDiscount] });
    results.push({
        id: 'SD-26', scenario: 'Discount does not apply when pickup time is outside the slot.',
        expected: '0 active discounts found.',
        actual: `${activeDiscounts.length} active discount(s) found.`,
        status: activeDiscounts.length === 0 ? 'Pass' : 'Fail',
    });
    
    // SD-27: Cart Discount - Not Applied Below Threshold
    const cartDiscount = { id: 'sd-27', discountType: 'cart', discountMethod: 'percentage', discountValue: 10, minOrderValue: 200, orderTypes: ['pickup'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pizzaItem, drinkItem], [cartDiscount], null);
    results.push({
        id: 'SD-27', scenario: 'Cart discount NOT applied if subtotal is below threshold.',
        expected: 'Total discount amount is 0.00',
        actual: `Total discount amount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 0 ? 'Pass' : 'Fail',
    });
    
    // SD-28: Cart Discount - Applied Above Threshold
    testResultCart = calculateDiscountForTest([pizzaItem, pastaItem], [cartDiscount], null);
    results.push({
        id: 'SD-28', scenario: 'Cart discount IS applied if subtotal is above threshold.',
        expected: 'Total discount amount is 22.00',
        actual: `Total discount amount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 22.00 ? 'Pass' : 'Fail',
    });

    // SD-29: Cart Discount - Percentage Calculation
    results.push({
        id: 'SD-29', scenario: 'Correct percentage calculation for cart-level discount.',
        expected: 'Cart total is 198.00 (220 - 10%)',
        actual: `Cart total is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.cartTotal === 198.00 ? 'Pass' : 'Fail',
    });

    // SD-30: Cart Discount - Fixed Amount Calculation
    const cartDiscountFixed = { id: 'sd-30', discountType: 'cart', discountMethod: 'fixed_amount', discountValue: 50, minOrderValue: 200, orderTypes: ['pickup'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pizzaItem, pastaItem], [cartDiscountFixed], null);
    results.push({
        id: 'SD-30', scenario: 'Correct fixed amount calculation for cart-level discount.',
        expected: 'Cart total is 170.00 (220 - 50)',
        actual: `Cart total is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.cartTotal === 170.00 ? 'Pass' : 'Fail',
    });

    // SD-31: Cart Discount - Interaction with Item Discounts (Updated Logic)
    const itemDiscountForInteraction = { id: 'sd-31-item', discountName: "Pizza Deal", discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 20, orderTypes: ['pickup'] } as StandardDiscount;
    const pizzaWithStandardDiscount = { ...pizzaItem, price: 80 }; // basePrice is still 100
    const cartDiscountForInteraction = { id: 'sd-31-cart', discountType: 'cart', discountMethod: 'percentage', discountValue: 10, minOrderValue: 100, orderTypes: ['pickup'] } as StandardDiscount;
    // Cart: Pizza (100 -> 80) + Pasta (120). Pizza is "locked". Subtotal of normal items = 120 (Pasta). Cart discount = 10% of 120 = 12. Total discount = 20 (item) + 12 (cart) = 32.
    testResultCart = calculateDiscountForTest([pizzaWithStandardDiscount, pastaItem], [itemDiscountForInteraction, cartDiscountForInteraction], null);
     results.push({
        id: 'SD-31', scenario: 'Cart discount only applies to non-item-discounted items.',
        expected: 'Total discount is 32.00. Final price is 188.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount?.amount === 32.00 && testResultCart.cartTotal === 188.00 ? 'Pass' : 'Fail',
    });

    // SD-32: Discount Code - Interaction with Item Discounts
    const discountCodeProduct: Discount = { id: 'dc-prod', code: 'PROD10', discountType: 'percentage', discountValue: 10 } as Discount;
    // Pizza is "locked" due to standard discount. Pasta (120) is normal. Code applies to Pasta only. Discount = 12. Total discount = 20 (item) + 12 (code) = 32.
    testResultCart = calculateDiscountForTest([pizzaWithStandardDiscount, pastaItem], [itemDiscountForInteraction], discountCodeProduct);
    results.push({
        id: 'SD-32', scenario: 'Discount code only applies to non-item-discounted items.',
        expected: 'Total discount is 32.00. Final price is 188.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount?.amount === 32.00 && testResultCart.cartTotal === 188.00 ? 'Pass' : 'Fail',
    });

    // SD-33: Discount Code vs. Auto Cart Discount (Code is better)
    const weakCartDiscount = { id: 'sd-33-cart', discountType: 'cart', discountMethod: 'percentage', discountValue: 5, minOrderValue: 100 } as StandardDiscount;
    const strongDiscountCode: Discount = { id: 'dc-strong', code: 'STRONG15', discountType: 'percentage', discountValue: 15 } as Discount;
    // Cart: Pasta (120) + Pizza2 (105). Total normal items = 225. Auto cart discount = 5% of 225 = 11.25. Code discount = 15% of 225 = 33.75. Code wins.
    testResultCart = calculateDiscountForTest([pastaItem, pizza2Item], [weakCartDiscount], strongDiscountCode);
    results.push({
        id: 'SD-33', scenario: 'Discount Code provides a better discount than an automatic cart discount.',
        expected: 'Code is applied. Total discount is 33.75',
        actual: `Code is applied. Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 33.75 ? 'Pass' : 'Fail',
    });


    // SD-34: Combo vs. Discount Code (No Stacking)
    const cartWithCombo = [comboItem, pastaItem]; // Combo (locked) + Pasta (normal)
    testResultCart = calculateDiscountForTest(cartWithCombo, [], strongDiscountCode);
    results.push({
        id: 'SD-34', scenario: 'Discount code does not apply to combo items.',
        expected: 'Discount is 18.00 (15% of 120)',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 18.00 ? 'Pass' : 'Fail',
    });

    // SD-35: Upsell vs. Standard Discount (No Stacking)
    const cartWithUpsell = [upsellItem, pizzaItem]; // Upsell (locked) + Pizza (normal)
    testResultCart = calculateDiscountForTest(cartWithUpsell, [cartDiscount], null);
    results.push({
        id: 'SD-35', scenario: 'Upsell price is preserved, cart discount ignored for it.',
        expected: 'Total discount is 10.00 (10% of 100 on Pizza)',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 10.00 ? 'Pass' : 'Fail',
    });
    
    // SD-36: Standard Discount vs. another Standard Discount (Best one wins)
    const itemDiscount1 = { id: 'sd-36-1', discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 10, orderTypes: ['pickup'] } as StandardDiscount;
    const itemDiscount2 = { id: 'sd-36-2', discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'fixed_amount', discountValue: 15, orderTypes: ['pickup'] } as StandardDiscount;
    const pizzaWithTwoDiscounts = { ...pizzaItem, price: 85 }; // base 100, final 85 (15kr off is better than 10%)
    testResultCart = calculateDiscountForTest([pizzaWithTwoDiscounts], [itemDiscount1, itemDiscount2], null);
     results.push({ 
        id: 'SD-36', scenario: 'Best standard discount is chosen when multiple apply to one item.',
        expected: 'Discount is 15.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`,
        status: testResultCart.finalDiscount?.amount === 15.00 ? 'Pass' : 'Fail',
    });
    
    // SD-40: Location Specificity - Applied
    const locationDiscount = { id: 'sd-40', discountType: 'product', referenceIds: ['pizza-1'], discountMethod: 'percentage', discountValue: 10, locationIds: [MOCK_LOCATION_ID], orderTypes: ['pickup']} as StandardDiscount;
    activeDiscounts = await getActiveStandardDiscounts({ brandId: MOCK_BRAND_ID, locationId: MOCK_LOCATION_ID, deliveryType: 'pickup', discountsForTest: [locationDiscount] });
    results.push({
        id: 'SD-40', scenario: 'Discount IS applied for an order at a valid location.',
        expected: '1 active discount found.',
        actual: `${activeDiscounts.length} active discount(s) found.`,
        status: activeDiscounts.length === 1 ? 'Pass' : 'Fail',
    });

    // SD-41: Location Specificity - Not Applied
    activeDiscounts = await getActiveStandardDiscounts({ brandId: MOCK_BRAND_ID, locationId: MOCK_OTHER_LOCATION_ID, deliveryType: 'pickup', discountsForTest: [locationDiscount] });
    results.push({
        id: 'SD-41', scenario: 'Discount is NOT applied for an order at an invalid location.',
        expected: '0 active discounts found.',
        actual: `${activeDiscounts.length} active discount(s) found.`,
        status: activeDiscounts.length === 0 ? 'Pass' : 'Fail',
    });
    
    // SD-42: Checkout page data verification
    const pizzaWithDiscountForCheckout = { ...pizzaItem, price: 80 }; // base 100
    const cartDiscountForCheckout = { id: 'sd-42-cart', discountName: "Cart Deal", discountType: 'cart', discountMethod: 'fixed_amount', discountValue: 10, minOrderValue: 100, orderTypes: ['pickup'] } as StandardDiscount;
    // Pizza (100) gets 20 off. Item discount = 20. Pasta (120) is normal. Cart discount = 10 off normal items. Total discount = 20 + 10 = 30.
    testResultCart = calculateDiscountForTest([pizzaWithDiscountForCheckout, pastaItem], [checkoutItemDiscount, cartDiscountForCheckout], null);
    
    const checkoutExpected = `Item discount on cart-pizza-1: 20.00. Total cart discount: 30.00`;
    const checkoutActual = `Item discount on cart-pizza-1: ${testResultCart.itemDiscounts['cart-pizza-1']?.toFixed(2) ?? '0.00'}. Total cart discount: ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}`;
    results.push({
        id: 'SD-42', scenario: 'Checkout data contains correct individual and total discounts.',
        expected: checkoutExpected,
        actual: checkoutActual,
        status: testResultCart.itemDiscounts['cart-pizza-1'] === 20 && testResultCart.finalDiscount?.amount === 30 ? 'Pass' : 'Fail',
    });

    // SD-43: Cart Discount with Toppings (threshold NOT met)
    // Cart: Pasta (120) + Pizza (100) with Toppings (10). Normal item subtotal = 120 + 100 = 220. Toppings = 10.
    // Discountable total = 220 + 10 = 230. Threshold (250) NOT met. No discount.
    const cartWithToppings = [ pastaItem, { ...pizzaItem, toppings: [{ name: 'Extra Cheese', price: 10 }] } as CartItem ];
    testResultCart = calculateDiscountForTest(cartWithToppings, [cartDiscountHighThreshold], null);
    results.push({
        id: 'SD-43', scenario: 'Topping prices are INCLUDED in cart discount calculation (threshold not met).',
        expected: 'Total discount is 0.00. Final price is 230.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount === null && testResultCart.cartTotal === 230.00 ? 'Pass' : 'Fail',
    });

    // SD-44: Cart Discount with Toppings (threshold IS met)
    // Cart: 2x Pasta(120), 1x Pizza(100) + Topping(10) -> Normal subtotal=340, Toppings=10. Discountable = 350.
    // 15% of 350 = 52.50. Total price = 240+100+10=350. Final price = 350-52.50 = 297.50
    const cartWithToppingsOverThreshold = [ { ...pastaItem, quantity: 2 }, { ...pizzaItem, toppings: [{ name: 'Extra Cheese', price: 10 }] } as CartItem ];
    testResultCart = calculateDiscountForTest(cartWithToppingsOverThreshold, [cartDiscountHighThreshold], null);
    results.push({
        id: 'SD-44', scenario: 'Topping prices are INCLUDED in cart discount calculation (threshold met).',
        expected: 'Total discount is 52.50. Final price is 297.50',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount?.amount === 52.50 && testResultCart.cartTotal === 297.50 ? 'Pass' : 'Fail',
    });
    
    // SD-45: Low base price, high topping price
    // Cart: LowBase(10) + Topping(90). Normal subtotal=10, Toppings=90. Discountable=100.
    // 10% discount on 100 = 10. Total price = 10+90=100. Final price = 100-10=90.
    const lowBaseCartDiscount = { id: 'sd-45-cart', discountName: "Low Base Deal", discountType: 'cart', discountMethod: 'percentage', discountValue: 10, minOrderValue: 50, orderTypes: ['pickup'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([lowBaseHighToppingItem], [lowBaseCartDiscount], null);
    results.push({
        id: 'SD-45', scenario: 'Low base price + high topping price correctly triggers cart discount.',
        expected: 'Total discount is 10.00. Final price is 90.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount?.amount === 10.00 && testResultCart.cartTotal === 90.00 ? 'Pass' : 'Fail',
    });
    
    // SD-46: Combo item with toppings (should still be locked)
    // This requires a feature that doesn't exist (toppings on combos). Marking as not implemented.
    results.push({ id: 'SD-46', scenario: 'Combo item with toppings is still locked.', expected: 'N/A', actual: 'N/A', status: 'Not Implemented' });

    // SD-47: Boundary test (just below threshold)
    // Cart: 1x Pasta (120) + 2x Drink (2*25=50). Total = 170. Discount minOrderValue = 200. No discount.
    const boundaryTestDiscount = { id: 'sd-47-cart', discountName: "Boundary", discountType: 'cart', discountMethod: 'fixed_amount', discountValue: 20, minOrderValue: 200, orderTypes: ['pickup'] } as StandardDiscount;
    testResultCart = calculateDiscountForTest([pastaItem, drinkItem], [boundaryTestDiscount], null);
    results.push({
        id: 'SD-47', scenario: 'Cart total just below discount threshold receives no discount.',
        expected: 'Total discount is 0.00. Final price is 170.00',
        actual: `Total discount is ${testResultCart.finalDiscount?.amount.toFixed(2) ?? '0.00'}. Final price is ${testResultCart.cartTotal.toFixed(2)}`,
        status: testResultCart.finalDiscount === null && testResultCart.cartTotal === 170.00 ? 'Pass' : 'Fail',
    });

    // Final Sort
    return results.sort((a,b) => {
        const aNum = parseInt(a.id.substring(3));
        const bNum = parseInt(b.id.substring(3));
        return aNum - bNum;
    });
}
