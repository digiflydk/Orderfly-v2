

'use server';

import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, Timestamp, getDoc, runTransaction, updateDoc, where, getDocs, documentId, query, limit, serverTimestamp } from 'firebase/firestore';
import type { CartItem, Discount, OrderDetail, Brand, Location, CustomerInfo, Customer, StandardDiscount, PaymentDetails, MinimalCartItem, Product, ComboMenu, Topping, ComboSelection, LoyaltySettings, AnonymousCookieConsent } from '@/types';
import { getDiscountByCode } from '@/app/superadmin/discounts/actions';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { getToppings } from '../superadmin/toppings/actions';
import { getLoyaltySettings } from '../superadmin/loyalty/actions';
import { getActiveStripeSecretKey } from '../superadmin/settings/actions';
import { getOrigin } from '@/lib/url';
import { generateOrderId } from '@/lib/order-id';
import { getOrderById, getOrderByCheckoutSessionId as getOrderBySessionId } from './order-actions';


// Helper functions for Stripe statement descriptors
function sanitizeDescriptor(s: string, max: number) {
  const allowed = s.toUpperCase().replace(/[^A-Z0-9 .\-&]/g, " ").replace(/\s+/g, " ").trim();
  return allowed.slice(0, max);
}
function makeDescriptorPrefix(brand: string) { return sanitizeDescriptor(`OFLY*${brand}`, 22); }
function makeDescriptorSuffix(city: string) { return sanitizeDescriptor(city, 10); }


async function createOrUpdateCustomer(customerInfo: CustomerInfo, brandId: string, locationId: string, newOrderTotal: number, anonymousConsentId?: string): Promise<string> {
    const customerId = `cust-${simpleHash(customerInfo.email)}`;
    const customerRef = doc(db, 'customers', customerId);

    try {
        const customerDoc = await getDoc(customerRef);
        let cookieConsentData: Customer['cookie_consent'] | undefined = undefined;

        if (anonymousConsentId) {
            const anonConsentRef = doc(db, 'anonymous_cookie_consents', anonymousConsentId);
            const anonConsentSnap = await getDoc(anonConsentRef);
            if (anonConsentSnap.exists()) {
                const data = anonConsentSnap.data() as AnonymousCookieConsent;
                cookieConsentData = {
                    marketing: data.marketing,
                    statistics: data.statistics,
                    functional: data.functional,
                    timestamp: data.last_seen,
                    consent_version: data.consent_version,
                    linked_anon_id: anonymousConsentId,
                    origin_brand: data.origin_brand,
                };
                 // After fetching, mark the anonymous record as linked
                await updateDoc(anonConsentRef, { linked_to_customer: true });
            }
        }

        if (customerDoc.exists()) {
            const customerData = customerDoc.data() as Customer;
            const updatedData: Partial<Customer> = {
                fullName: customerInfo.name,
                phone: customerInfo.phone,
                street: customerInfo.street,
                zipCode: customerInfo.zipCode,
                city: customerInfo.city,
                // These will be updated by the webhook to prevent race conditions
                // totalOrders: (customerData.totalOrders || 0) + 1,
                // totalSpend: (customerData.totalSpend || 0) + newOrderTotal,
                // lastOrderDate: Timestamp.now(),
                locationIds: Array.from(new Set([...(customerData.locationIds || []), locationId])),
                marketingConsent: customerData.marketingConsent || customerInfo.subscribeToNewsletter,
            };
            
            // Only update cookie consent if new data is available and not already set
            if (cookieConsentData && !customerData.cookie_consent?.linked_anon_id) {
                updatedData.cookie_consent = cookieConsentData;
            }


            await updateDoc(customerRef, updatedData);
        } else {
            const newCustomer: Customer = {
                id: customerId,
                brandId: brandId,
                fullName: customerInfo.name,
                email: customerInfo.email,
                phone: customerInfo.phone,
                street: customerInfo.street,
                zipCode: customerInfo.zipCode,
                city: customerInfo.city,
                country: 'DK',
                marketingConsent: customerInfo.subscribeToNewsletter,
                status: 'active',
                createdAt: Timestamp.now(),
                totalOrders: 0, // Initial creation, will be updated by webhook
                totalSpend: 0,  // Initial creation
                locationIds: [locationId],
                loyaltyScore: 0,
                loyaltyClassification: 'New',
                cookie_consent: cookieConsentData,
            };
            await setDoc(customerRef, newCustomer);
        }
        
        return customerId;
    } catch (e: any) {
        console.error("Customer creation/update failed:", e);
        throw new Error(`Could not create or update customer profile: ${e.message}`);
    }
}

// Simple hash function to create a numeric ID from an email string
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}


// This function is now obsolete. The logic has been integrated into the Stripe checkout action.
// We keep it here to avoid breaking any potential old references, but it should be considered deprecated.
export async function createAndSaveOrder(
  // ... parameters
): Promise<{ order: OrderDetail; brandSlug: string; locationSlug: string }> {
    throw new Error("createAndSaveOrder is deprecated. Order creation is now handled by the Stripe checkout flow.");
}


export async function createStripeCheckoutSessionAction(
    cartItems: MinimalCartItem[],
    customerInfo: CustomerInfo,
    deliveryType: 'delivery' | 'pickup',
    brandId: string,
    locationId: string,
    paymentDetails: Omit<PaymentDetails, 'paymentRefId'>,
    appliedDiscountId: string | null,
    brandSlug: string,
    locationSlug: string,
    deliveryTime?: string,
    anonymousConsentId?: string
): Promise<{ success: boolean; url?: string | null; error?: string }> {
  try {
    const stripeSecretKey = await getActiveStripeSecretKey();
    if (!stripeSecretKey) {
        throw new Error('Stripe API key is not configured.');
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const origin = await getOrigin();
    
    const [brand, location] = await Promise.all([
        getBrandById(brandId),
        getLocationById(locationId),
    ]);
    if (!brand || !location) throw new Error("Brand or location not found");
    
    const customerId = await createOrUpdateCustomer(customerInfo, brand.id, location.id, 0, anonymousConsentId);

    // Step 1: Pre-create order with 'Pending' status
    const orderId = generateOrderId();
    const orderRef = doc(db, 'orders', orderId);

    const totalAmount = (paymentDetails.subtotal - (paymentDetails.discountTotal || 0)) + paymentDetails.deliveryFee + (paymentDetails.bagFee || 0) + (paymentDetails.adminFee || 0);

    await setDoc(orderRef, {
        id: orderId,
        createdAt: serverTimestamp(),
        status: 'Received',
        paymentStatus: 'Pending',
        brandId,
        locationId,
        productItems: cartItems,
        totalAmount,
        paymentDetails,
        customerName: customerInfo.name,
        customerContact: customerInfo.email,
        deliveryType: deliveryType === 'delivery' ? 'Delivery' : 'Pickup',
        deliveryTime,
        brandName: brand.name,
        locationName: location.name,
        customerDetails: {
            id: customerId,
            address: deliveryType === 'delivery' ? `${customerInfo.street}, ${customerInfo.zipCode} ${customerInfo.city}` : 'For Pickup',
        },
        psp: { provider: 'stripe' },
    });


    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => ({
        price_data: {
            currency: 'dkk',
            product_data: { name: item.name, description: item.toppings?.join(', ') || undefined },
            unit_amount: Math.round(item.totalPrice * 100), // Use totalPrice to include toppings
        },
        quantity: item.quantity,
    }));

    if (deliveryType === 'delivery' && paymentDetails.deliveryFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Delivery Fee' }, unit_amount: Math.round(paymentDetails.deliveryFee * 100) },
            quantity: 1,
        });
    }
    if (paymentDetails.bagFee && paymentDetails.bagFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Bag Fee' }, unit_amount: Math.round(paymentDetails.bagFee * 100) },
            quantity: 1,
        });
    }
    if (paymentDetails.adminFee && paymentDetails.adminFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Admin Fee' }, unit_amount: Math.round(paymentDetails.adminFee * 100) },
            quantity: 1,
        });
    }

    const coupons: Stripe.Checkout.SessionCreateParams.Coupon[] = [];
    if (paymentDetails.cartDiscountTotal && paymentDetails.cartDiscountTotal > 0) {
        const coupon = await stripe.coupons.create({
            amount_off: Math.round(paymentDetails.cartDiscountTotal * 100),
            currency: 'dkk',
            duration: 'once',
            name: paymentDetails.cartDiscountName,
        });
        coupons.push(coupon.id);
    }
    
    // Step 2: Create Stripe session with orderId in metadata
    const success_url = `${origin}/${brandSlug}/${locationSlug}/checkout/confirmation?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/${brandSlug}/${locationSlug}/checkout/cancel`;

    const statement_descriptor = makeDescriptorPrefix(brand.name);
    const statement_descriptor_suffix = makeDescriptorSuffix(location.city);

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        customer_email: customerInfo.email,
        success_url: success_url,
        cancel_url: cancel_url,
        metadata: {
            orderId,
            brandId,
            locationId,
            appliedDiscountId: appliedDiscountId || '',
            anonymousConsentId: anonymousConsentId || '',
        },
        discounts: coupons,
        payment_intent_data: {
            statement_descriptor: statement_descriptor,
            statement_descriptor_suffix: statement_descriptor_suffix,
            metadata: { orderId, brandId, locationId },
        },
    });
    
    // Step 3: Patch order with session ID
    await updateDoc(orderRef, {
        'psp.checkoutSessionId': session.id,
        updatedAt: serverTimestamp(),
    });

    return { success: true, url: session.url };

  } catch (e: any) {
    console.error("Failed to create Stripe checkout session:", e);
    const errorMessage = e instanceof Error ? e.message : "An unknown error occurred";
    return { success: false, error: errorMessage };
  }
}


export async function validateDiscountAction(
    code: string, 
    brandId: string, 
    locationId: string, 
    subtotal: number,
    deliveryType: 'delivery' | 'pickup'
): Promise<{ success: boolean; message: string; discount?: Discount; }> {
    const codeUpper = code.toUpperCase();
    const discount = await getDiscountByCode(codeUpper, brandId);

    if (!discount) {
        return { success: false, message: 'Invalid discount code.' };
    }
    if (!discount.isActive) {
        return { success: false, message: 'This discount is no longer active.' };
    }
    if (discount.usageLimit > 0 && discount.usedCount >= discount.usageLimit) {
        return { success: false, message: 'This discount has reached its usage limit.' };
    }
    if (discount.startDate && new Date(discount.startDate) > new Date()) {
        return { success: false, message: 'This discount is not yet active.' };
    }
    if (discount.endDate && new Date(discount.endDate) < new Date()) {
        return { success: false, message: 'This discount has expired.' };
    }
    if (discount.minOrderValue && subtotal < discount.minOrderValue) {
        return { success: false, message: `Minimum order value of kr. ${discount.minOrderValue.toFixed(2)} not met.` };
    }
    if (!discount.locationIds.includes(locationId)) {
        return { success: false, message: 'This discount is not valid for this location.' };
    }
    
    return { success: true, message: 'Discount applied!', discount };
}

// New helper functions for confirmation page
export async function getOrderByCheckoutSessionId(sessionId: string): Promise<OrderDetail | null> {
    return await getOrderBySessionId(sessionId);
}

export async function waitForOrderBySessionId(sessionId: string, timeoutMs = 20000, stepMs = 1000): Promise<OrderDetail | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const order = await getOrderBySessionId(sessionId);
        if (order) return order;
        await new Promise(r => setTimeout(r, stepMs));
    }
    return null;
}

    
