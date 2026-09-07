

'use server';

import { validateCheckoutPrices } from '@/lib/checkout-price-validation';
import { findCheckoutCustomer } from '@/lib/checkout-customer-identity';
import { omitUndefinedFields } from '@/lib/firestore-optional-fields';
import { newsletterEligible, cartLineEligible, assignedCustomerMatches, restaurantClock } from '@/lib/promotion-rules';
import { reserveDiscount, releaseDiscount } from '@/lib/discount-reservations';
import { createHash, randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, runTransaction, updateDoc, where, getDocs, documentId, query, limit, serverTimestamp } from 'firebase/firestore';
import type { CartItem, Discount, OrderDetail, Brand, Location, CustomerInfo, Customer, StandardDiscount, Upsell, PaymentDetails, MinimalCartItem, Product, ComboMenu, Topping, ComboSelection, LoyaltySettings, AnonymousCookieConsent } from '@/types';
import { getDiscountByCode, getDiscountById } from '@/app/superadmin/discounts/actions';
import { bestAutomaticDiscount, isQuantityMethod, type OfferLine } from '@/lib/automatic-discounts';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { getToppings } from '../superadmin/toppings/actions';
import { verifiedCustomer } from '@/lib/loyalty/identity';
import { getProgram, walletView, reserveRewards, settleRewards } from '@/lib/loyalty/rewards';
import { rewardQuote,ore } from '@/lib/loyalty/model';
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

    const integrated = await findCheckoutCustomer(brandId, normalizedEmail);
    if (integrated) return { customerRef: integrated.ref, customerDoc: integrated, normalizedEmail };

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

async function createOrUpdateCustomer(customerInfo: CustomerInfo, brandId: string, locationId: string, newOrderTotal: number, anonymousConsentId?: string, newsletterDiscountId?: string): Promise<string> {
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

            if (newsletterDiscountId && !customerData.marketingConsent) updatedData.pendingNewsletterDiscountId = newsletterDiscountId;
            await updateDoc(customerRef, omitUndefinedFields(updatedData));
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
            if (newsletterDiscountId) newCustomer.pendingNewsletterDiscountId = newsletterDiscountId;
            await setDoc(customerRef, omitUndefinedFields(newCustomer));
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

function asDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
    }
    const parsed = new Date(value as string | number);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function calculateDiscountAmount(discount: Discount, subtotal: number): number {
    if (subtotal <= 0) return 0;
    if (discount.discountType === 'percentage') {
        return Math.min(subtotal, subtotal * (discount.discountValue / 100));
    }
    return Math.min(subtotal, discount.discountValue);
}

type DiscountEligibilityContext = {
    brandId: string;
    locationId: string;
    deliveryType: 'delivery' | 'pickup';
    subtotal: number;
    customerId?: string;
    customer?: Customer | null;
    newsletterConsent?: boolean;
};

function validateDiscountEligibility(discount: Discount, context: DiscountEligibilityContext): string | null {
    const now = new Date();
    const applicationType = discount.applicationType ?? 'code';

    if (discount.brandId !== context.brandId) return 'This discount belongs to another brand.';
    if (!discount.isActive) return 'This discount is no longer active.';
    if (!discount.locationIds.includes(context.locationId)) return 'This discount is not valid for this location.';
    if (!discount.orderTypes.includes(context.deliveryType)) return 'This discount is not valid for this order type.';
    if (discount.usageLimit > 0 && discount.usedCount >= discount.usageLimit) return 'This discount has reached its usage limit.';
    if (discount.minOrderValue && context.subtotal < discount.minOrderValue) return `Minimum order value of kr. ${discount.minOrderValue.toFixed(2)} not met.`;

    const startDate = asDate(discount.startDate);
    const endDate = asDate(discount.endDate);
    if (startDate && startDate > now) return 'This discount is not yet active.';
    if (endDate && endDate < now) return 'This discount has expired.';

    const currentDay = restaurantClock(now).day;
    if ((discount.activeDays || []).length > 0 && !discount.activeDays.includes(currentDay)) return 'This discount is not active today.';
    if ((discount.activeTimeSlots || []).length > 0) {
        const currentTime = restaurantClock(now).time;
        if (!discount.activeTimeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end)) return 'This discount is not active at this time.';
    }

    if (!assignedCustomerMatches(discount.assignedToCustomerId, context.customerId)) return 'This discount is assigned to another customer.';
    if (discount.firstTimeCustomerOnly && (context.customer?.totalOrders || 0) > 0) return 'This discount is only available to first-time customers.';
    if (discount.perCustomerLimit > 0 && ((context.customer?.discountUsage?.[discount.id] || 0) >= discount.perCustomerLimit)) return 'This discount has reached its per-customer limit.';

    if (applicationType === 'newsletter_signup') {
        if (!context.newsletterConsent) return 'Newsletter signup is required for this discount.';
        if (!newsletterEligible(!!context.customer?.marketingConsent, context.customer?.pendingNewsletterDiscountId, discount.id, context.customer?.discountUsage?.[discount.id] || 0)) return 'This newsletter discount has already been used.';
    }

    return null;
}

export type NewsletterDiscountOffer = Pick<Discount, 'id' | 'description' | 'discountType' | 'discountValue' | 'minOrderValue'> & {
    applicationType: 'newsletter_signup';
};

export async function getNewsletterSignupDiscountAction(
    brandId: string,
    locationId: string,
    subtotal: number,
    deliveryType: 'delivery' | 'pickup',
    email?: string
): Promise<NewsletterDiscountOffer | null> {
    if (!email || !email.includes('@')) return null;
    const resolved = await resolveCheckoutCustomerRef({ email } as CustomerInfo, brandId);
    const customer = resolved.customerDoc.exists() ? resolved.customerDoc.data() as Customer : undefined;
    const discountsQuery = query(collection(db, 'discounts'), where('brandId', '==', brandId));
    const snapshot = await getDocs(discountsQuery);

    for (const discountDoc of snapshot.docs) {
        const data = discountDoc.data();
        if (data.applicationType !== 'newsletter_signup') continue;
        const discount = {
            ...data,
            id: discountDoc.id,
            startDate: asDate(data.startDate),
            endDate: asDate(data.endDate),
        } as Discount;
        const error = validateDiscountEligibility(discount, {
            brandId,
            locationId,
            deliveryType,
            subtotal,
            newsletterConsent: true,
            customerId: resolved.customerRef.id,
            customer,
        });
        if (error) continue;

        return {
            id: discount.id,
            description: discount.description,
            discountType: discount.discountType,
            discountValue: discount.discountValue,
            minOrderValue: discount.minOrderValue,
            applicationType: 'newsletter_signup',
        };
    }
    return null;
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
    anonymousConsentId?: string,
    loyaltyRequest?: { token: string; redeemOre: number }
): Promise<{ success: boolean; url?: string | null; error?: string }> {
  let reservedOrderId: string | undefined;
  let rewardOrderId: string | undefined;
  let sessionRequestStarted = false;
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
    
    const resolvedCustomer = await resolveCheckoutCustomerRef(customerInfo, brand.id);
    const existingCustomer = resolvedCustomer.customerDoc.exists()
      ? resolvedCustomer.customerDoc.data() as Customer
      : null;

    const chargedItemsSubtotal = cartItems.reduce((sum, item) => {
      const lineTotal = toNumber(item.totalPrice);
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || lineTotal < 0) throw new Error('Invalid cart item quantity or total.');
      return sum + Math.round(lineTotal*100)/100;
    }, 0);
    const itemDiscountTotal = Math.max(0, toNumber(paymentDetails.subtotal) - chargedItemsSubtotal);
    const activeStandardDiscounts = await getActiveStandardDiscounts({
      brandId,
      locationId,
      deliveryType,
    });

    // Resolve eligibility from native catalog records; the browser cannot mark a combo as a product.
    const quantityLines: OfferLine[] = [];
    const resolvedLines = await Promise.all(cartItems.map(async item => {
      if (!item.id) throw new Error('Please refresh your basket before checking out.');
      let [productSnap, comboSnap] = await Promise.all([
        getDoc(doc(db, 'products', item.id)), getDoc(doc(db, 'comboMenus', item.id)),
      ]);
      if (!productSnap.exists() && !comboSnap.exists() && item.id.endsWith('-offer')) {
        productSnap = await getDoc(doc(db, 'products', item.id.slice(0, -6)));
      }
      const catalog = productSnap.exists() ? productSnap.data() as Product : null;
      const combo = comboSnap.exists() ? comboSnap.data() : null;
      const record = catalog || combo;
      if (!record || record.brandId !== brandId || (record.locationIds?.length && !record.locationIds.includes(locationId))) throw new Error('Basket item is unavailable at this restaurant.');
      return { productSnap, catalog, combo, price: combo
        ? (deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice)
        : (deliveryType === 'delivery' ? (catalog!.priceDelivery ?? catalog!.price) : catalog!.price) };
    }));
    const upsellRows = await getDocs(query(collection(db, 'upsells'), where('brandId', '==', brandId), where('isActive', '==', true)));
    const upsells = upsellRows.docs.map(row => ({ ...row.data(), id: row.id })) as Upsell[];
    validateCheckoutPrices(cartItems, resolvedLines.map(({productSnap,catalog,combo,price},i) => ({
      id: catalog ? productSnap.id : cartItems[i].id!, categoryId: catalog?.categoryId, isCombo: !!combo, price,
      tags: catalog ? [...(catalog.isPopular ? ['Popular'] : []), ...(catalog.isFeatured ? ['Recommended'] : []), ...(catalog.isNew ? ['Campaign'] : [])] : [],
    })), activeStandardDiscounts, upsells, {brandId,locationId,deliveryType});
    const eligibleLines = resolvedLines.map(({productSnap,catalog,combo,price:catalogPrice},index) => {
      const item = cartItems[index];
      if (combo) return 0;
      const itemOffer = activeStandardDiscounts.some(d =>
        !isQuantityMethod(d.discountMethod) && ((d.discountType === 'product' && d.referenceIds.includes(productSnap.id)) ||
        (d.discountType === 'category' && d.referenceIds.includes(catalog!.categoryId)))
      );
      const eligible = cartLineEligible(false, catalogPrice, item.unitPrice, itemOffer);
      if (eligible && Number.isSafeInteger(item.quantity) && item.quantity > 0) quantityLines.push({
        id: productSnap.id, categoryId: catalog!.categoryId, quantity: item.quantity,
        unitPrice: Math.max(0, Math.min(catalogPrice, item.unitPrice, item.totalPrice / item.quantity)),
      });
      return eligible ? item.totalPrice : 0;
    });
    const eligibleSubtotal = eligibleLines.reduce((sum, amount) => sum + amount, 0);

    const automaticCartDiscount = bestAutomaticDiscount(activeStandardDiscounts, eligibleSubtotal, quantityLines);

    let selectedDiscount: Discount | null = null;
    let selectedDiscountAmount = 0;
    if (appliedDiscountId) {
      selectedDiscount = await getDiscountById(appliedDiscountId);
      if (!selectedDiscount) throw new Error('The selected discount no longer exists.');
      const eligibilityError = validateDiscountEligibility(selectedDiscount, {
        brandId,
        locationId,
        deliveryType,
        subtotal: eligibleSubtotal,
        customerId: resolvedCustomer.customerRef.id,
        customer: existingCustomer,
        newsletterConsent: customerInfo.subscribeToNewsletter,
      });
      if (eligibilityError) throw new Error(eligibilityError);
      selectedDiscountAmount = calculateDiscountAmount(selectedDiscount, eligibleSubtotal);
    }

    const manualDiscountWins = selectedDiscountAmount > (automaticCartDiscount?.amount || 0);
    let cartDiscountTotal = manualDiscountWins
      ? selectedDiscountAmount
      : (automaticCartDiscount?.amount || 0);
    let cartDiscountName = manualDiscountWins
      ? (selectedDiscount?.applicationType === 'newsletter_signup' ? 'Newsletter signup' : selectedDiscount?.code)
      : automaticCartDiscount?.name;
    const appliedDiscountIdForOrder = manualDiscountWins ? selectedDiscount?.id || null : null;
    cartDiscountTotal=Math.round(cartDiscountTotal*100)/100;

    const rewardIdentity = loyaltyRequest ? await verifiedCustomer(loyaltyRequest.token,customerInfo.email) : null;
    const rewardProgram = rewardIdentity ? await getProgram(brandId) : null;
    const rewardWallet = rewardIdentity ? await walletView(brandId,rewardIdentity.uid) : null;
    if (loyaltyRequest?.redeemOre && cartDiscountTotal>0) throw new Error('Loyalty kan ikke kombineres med en kurvrabat. Fjern rabatkoden eller brug din saldo næste gang.');
    const rewardGoodsOre = ore(Math.max(0,chargedItemsSubtotal-cartDiscountTotal));
    const reward = rewardProgram ? rewardQuote(rewardProgram,rewardWallet!.availableOre,rewardGoodsOre,loyaltyRequest!.redeemOre) : {redeemOre:0,earnOre:0};
    if (reward.redeemOre) {cartDiscountTotal+=reward.redeemOre/100;cartDiscountName='Loyalty';}

    const hasFreeDelivery = deliveryType === 'delivery' && activeStandardDiscounts.some(discount =>
      discount.discountType === 'free_delivery' && chargedItemsSubtotal >= (discount.minOrderValue || 0)
    );
    const effectiveDeliveryFee = deliveryType === 'delivery' && !hasFreeDelivery
      ? Math.round(Math.max(0, toNumber(location.deliveryFee))*100)/100
      : 0;
    const effectiveBagFee = Math.round(Math.min(Math.max(0, toNumber(paymentDetails.bagFee)), Math.max(0, toNumber(brand.bagFee)))*100)/100;
    const subtotalAfterDiscount = Math.max(0, chargedItemsSubtotal - cartDiscountTotal);
    const rawAdminFee = brand.adminFeeType === 'percentage'
      ? subtotalAfterDiscount * (Math.max(0, toNumber(brand.adminFee)) / 100)
      : Math.max(0, toNumber(brand.adminFee));
    const effectiveAdminFee=Math.round(rawAdminFee*100)/100;
    const totalAmount = Math.round((subtotalAfterDiscount + effectiveDeliveryFee + effectiveBagFee + effectiveAdminFee)*100)/100;
    const serverPaymentDetails: Omit<PaymentDetails, 'paymentRefId'> = {
      ...paymentDetails,
      subtotal: toNumber(paymentDetails.subtotal),
      itemDiscountTotal,
      cartDiscountTotal,
      cartDiscountName,
      discountTotal: itemDiscountTotal + cartDiscountTotal,
      deliveryFee: effectiveDeliveryFee,
      bagFee: effectiveBagFee,
      adminFee: effectiveAdminFee,
      vatAmount: totalAmount * ((brand.vatPercentage || 25) / (100 + (brand.vatPercentage || 25))),
    };

    const customerId = await createOrUpdateCustomer(customerInfo, brand.id, location.id, totalAmount, anonymousConsentId, selectedDiscount?.applicationType === 'newsletter_signup' ? selectedDiscount.id : undefined);

    // Step 1: Pre-create order with 'Pending' status
    const orderId = generateOrderId();
    const cancelToken = randomBytes(32).toString('hex');
    const orderRef = doc(db, 'orders', orderId);

    if (rewardIdentity && rewardProgram?.enabled) {
      await reserveRewards(orderId,brandId,rewardIdentity.uid,reward.redeemOre,rewardGoodsOre,ore(totalAmount)+reward.redeemOre,rewardProgram);
      rewardOrderId=orderId;
    }
    await setDoc(orderRef, omitUndefinedFields({
        id: orderId,
        createdAt: serverTimestamp(),
        status: 'Received',
        paymentStatus: 'Pending',
        brandId,
        locationId,
        productItems: cartItems.map(item=>({...item,totalPrice:Math.round(item.totalPrice*100)/100})),
        totalAmount,
        loyalty: rewardIdentity && rewardProgram?.enabled ? {redeemedOre:reward.redeemOre,earnedOre:reward.earnOre} : null,
        paymentDetails: serverPaymentDetails,
        appliedDiscountId: appliedDiscountIdForOrder,
        cancelTokenHash: createHash('sha256').update(cancelToken).digest('hex'),
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
    }));


    await reserveDiscount(orderId, appliedDiscountIdForOrder, customerId, brandId);
    reservedOrderId = orderId;

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => {
        if (item.unitPrice == null) {
            throw new Error(`Missing unitPrice for cart item: ${item.name ?? 'unknown'}`);
        }

        return {
            price_data: {
                currency: 'dkk',
                product_data: { name: `${item.quantity} × ${item.name}`, description: item.toppings?.join(', ') || undefined },
                unit_amount: Math.round(item.totalPrice * 100),
            },
            quantity: 1,
        };
    });

    if (deliveryType === 'delivery' && serverPaymentDetails.deliveryFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Delivery Fee' }, unit_amount: Math.round(serverPaymentDetails.deliveryFee * 100) },
            quantity: 1,
        });
    }
    if (serverPaymentDetails.bagFee && serverPaymentDetails.bagFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Bag Fee' }, unit_amount: Math.round(serverPaymentDetails.bagFee * 100) },
            quantity: 1,
        });
    }
    if (serverPaymentDetails.adminFee && serverPaymentDetails.adminFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Admin Fee' }, unit_amount: Math.round(serverPaymentDetails.adminFee * 100) },
            quantity: 1,
        });
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        customer_email: customerInfo.email,
        success_url: `${origin}/${brandSlug}/${locationSlug}/checkout/confirmation?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/${brandSlug}/${locationSlug}/checkout/cancel?order_id=${orderId}&token=${cancelToken}`,
        metadata: {
            orderId,
            brandId,
            locationId,
            appliedDiscountId: appliedDiscountIdForOrder || '',
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
            name: serverPaymentDetails.cartDiscountName || 'Discount',
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
    }
    
    // Step 2: Create Stripe session with orderId in metadata
    sessionRequestStarted = true;
    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: orderId });
    
    // Step 3: Patch order with session ID
    await updateDoc(orderRef, {
        'psp.checkoutSessionId': session.id,
        updatedAt: serverTimestamp(),
    });

    return { success: true, url: session.url };

  } catch (e: any) {
    // Once a request may have reached Stripe, keep the hold until a signed expiration
    // event. A timeout is not proof that a payable session was not created.
    if (!sessionRequestStarted) {
      if (reservedOrderId) await releaseDiscount(reservedOrderId, brandId);
      if (rewardOrderId) await settleRewards(rewardOrderId,brandId,false);
    }
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
    deliveryType: 'delivery' | 'pickup',
    customerEmail?: string
): Promise<{ success: boolean; message: string; discount?: Discount; }> {
    const codeUpper = code.toUpperCase();
    const discount = await getDiscountByCode(codeUpper, brandId);

    if (!discount) {
        return { success: false, message: 'Invalid discount code.' };
    }
    let customer: Customer | null = null;
    let customerId: string | undefined;
    if (customerEmail?.trim()) {
        const resolved = await resolveCheckoutCustomerRef({
            name: '',
            email: customerEmail,
            phone: '',
            subscribeToNewsletter: false,
        }, brandId);
        customerId = resolved.customerRef.id;
        customer = resolved.customerDoc.exists() ? resolved.customerDoc.data() as Customer : null;
    }

    if ((discount.firstTimeCustomerOnly || discount.assignedToCustomerId || discount.perCustomerLimit > 0) && !customerId) {
        return { success: false, message: 'Enter your email before applying this discount.' };
    }

    const eligibilityError = validateDiscountEligibility(discount, {
        brandId,
        locationId,
        deliveryType,
        subtotal,
        customerId,
        customer,
    });
    if (eligibilityError) return { success: false, message: eligibilityError };
    
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

    

    
