

'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, runTransaction, updateDoc, where, getDocs, documentId, query, limit, serverTimestamp } from 'firebase/firestore';
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

function normalizeCustomerEmail(value: string): string {
    return value.trim().toLowerCase();
}

function scopedCustomerId(brandId: string, normalizedEmail: string): string {
    const digest = createHash('sha256')
        .update(`${brandId}\n${normalizedEmail}`, 'utf8')
        .digest('hex')
        .slice(0, 32);
    return `cust-v2-${digest}`;
}

async function resolveCheckoutCustomerRef(customerInfo: CustomerInfo, brandId: string) {
    const normalizedEmail = normalizeCustomerEmail(customerInfo.email);
    if (!normalizedEmail) throw new Error('Customer email is required.');

    const scopedRef = doc(db, 'customers', scopedCustomerId(brandId, normalizedEmail));
    const scopedDoc = await getDoc(scopedRef);
    if (scopedDoc.exists()) {
        const scopedData = scopedDoc.data() as Customer;
        if (scopedData.brandId !== brandId) {
            throw new Error('Customer identity scope conflict.');
        }
        return { customerRef: scopedRef, customerDoc: scopedDoc, normalizedEmail };
    }

    // Backward compatibility: older checkout customers used an email-only hash.
    // Reuse that native id only when the existing document belongs to this exact brand.
    const legacyRef = doc(db, 'customers', `cust-${simpleHash(customerInfo.email)}`);
    const legacyDoc = await getDoc(legacyRef);
    if (legacyDoc.exists()) {
        const legacyData = legacyDoc.data() as Customer;
        if (legacyData.brandId === brandId) {
            return { customerRef: legacyRef, customerDoc: legacyDoc, normalizedEmail };
        }
    }

    return { customerRef: scopedRef, customerDoc: scopedDoc, normalizedEmail };
}

async function createOrUpdateCustomer(customerInfo: CustomerInfo, brandId: string, locationId: string, newOrderTotal: number, anonymousConsentId?: string): Promise<string> {
    try {
        const { customerRef, customerDoc, normalizedEmail } = await resolveCheckoutCustomerRef(customerInfo, brandId);
        const customerId = customerRef.id;
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
                    timestamp: (data.last_seen as any).toDate(),
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
            if (customerData.brandId !== brandId) {
                throw new Error('Customer identity scope conflict.');
            }
            const updatedData: Partial<Customer> & { normalizedEmail?: string } = {
                fullName: customerInfo.name,
                email: normalizedEmail,
                normalizedEmail,
                phone: customerInfo.phone,
                street: customerInfo.street,
                zipCode: customerInfo.zipCode,
                city: customerInfo.city,
                // These will be updated by the webhook to prevent race conditions
                // totalOrders: (customerData.totalOrders || 0) + 1,
                // totalSpend: (customerData.totalSpend || 0) + newOrderTotal,
                // lastOrderDate: new Date(),
                locationIds: Array.from(new Set([...(customerData.locationIds || []), locationId])),
                marketingConsent: customerData.marketingConsent || customerInfo.subscribeToNewsletter,
            };
            
            // Only update cookie consent if new data is available and not already set
            if (cookieConsentData && !customerData.cookie_consent?.linked_anon_id) {
                updatedData.cookie_consent = cookieConsentData;
            }

            await updateDoc(customerRef, updatedData);
        } else {
            const newCustomer: Customer & { normalizedEmail: string } = {
                id: customerId,
                brandId: brandId,
                fullName: customerInfo.name,
                email: normalizedEmail,
                normalizedEmail,
                phone: customerInfo.phone,
                street: customerInfo.street,
                zipCode: customerInfo.zipCode,
                city: customerInfo.city,
                country: 'DK',
                marketingConsent: customerInfo.subscribeToNewsletter,
                status: 'active',
                createdAt: new Date(),
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

// Legacy hash retained only for safe lookup of pre-v2 customer ids.
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

const toNumber = (value: number | string | null | undefined): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};


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
    const stripe = new Stripe(stripeSecretKey);

    const origin = await getOrigin();
    
    const [brand, location] = await Promise.all([
        getBrandById(brandId),
        getLocationById(locationId),
    ]);
    if (!brand || !location || location.brandId !== brand.id) throw new Error("Brand or location not found in the requested tenant scope");
    
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


    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => {
        if (item.unitPrice == null) {
            throw new Error(`Missing unitPrice for cart item: ${item.name ?? 'unknown'}`);
        }

        return {
            price_data: {
                currency: 'dkk',
                product_data: { name: item.name, description: item.toppings?.join(', ') || undefined },
                unit_amount: Math.round(item.unitPrice! * 100),
            },
            quantity: item.quantity,
        };
    });

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

    const cartDiscountTotal = toNumber(paymentDetails.cartDiscountTotal);
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        customer_email: customerInfo.email,
        success_url: `${origin}/${brandSlug}/${locationSlug}/checkout/confirmation?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/${brandSlug}/${locationSlug}/checkout/cancel`,
        metadata: {
            orderId,
            brandId,
            locationId,
            appliedDiscountId: appliedDiscountId || '',
            anonymousConsentId: anonymousConsentId || '',
        },
        payment_intent_data: {
            statement_descriptor: makeDescriptorPrefix(brand.name),
            statement_descriptor_suffix: makeDescriptorSuffix(location.city),
            metadata: { orderId, brandId, locationId },
        },
    };

    if (cartDiscountTotal > 0) {
        const coupon = await stripe.coupons.create({
            amount_off: Math.round(cartDiscountTotal * 100),
            currency: 'dkk',
            duration: 'once',
            name: paymentDetails.cartDiscountName || 'Discount',
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
    }
    
    // Step 2: Create Stripe session with orderId in metadata
    const session = await stripe.checkout.sessions.create(sessionParams);
    
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

    

    
