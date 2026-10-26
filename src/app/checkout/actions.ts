'use server';
import { discountApplicationType, checkoutSignupMode, clubDiscountEligible, signupModeAllows, type CheckoutSignupMode } from '@/lib/promotion-rules';
import { getClubSignupDiscountEligibility, validateClubCheckoutSignup, prepareClubCheckoutSignup } from '@/lib/loyalty/stamp-card/club-signup';

import { isSyntheticProduct } from '@/lib/synthetic-product';

import {getAdminDb} from '@/lib/firebase-admin';
import {linkCheckoutConsent} from '@/lib/server/consent-identity';
import {recordNewsletterConsent} from '@/lib/marketing/store';
import { marketingConfig } from '@/lib/marketing/config';
import { ore, money, sumMoney, percentageMoney } from '@/lib/money';
import { trackServerEvent } from '@/lib/analytics-server';
import { checkoutRequestSchema, deliveryQuoteRequestSchema, managedDeliveryAcceptanceSchema } from '@/lib/checkout-schema';
import { resolveFulfillmentTime, displayFulfillmentTime } from '@/lib/fulfillment-time';
import { assertCheckoutPaymentMethod } from '@/lib/merchant-payment-methods';
import { validateCheckoutItems } from '@/lib/checkout-items';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import { isDefinitiveStripeRejection } from '@/lib/stripe-checkout-failure';
import { validateCheckoutPrices } from '@/lib/checkout-price-validation';
import { findCheckoutCustomer } from '@/lib/checkout-customer-identity';
import { checkoutCustomerIdentityMessage } from '@/lib/checkout-public-error';
import { customerHasEmail, customerHasPhone, mergeCustomerIdentity } from '@/lib/customer-identity';
import { normalizePhone } from '@/lib/integrations/esmeralda-customer-contract';
import { omitUndefinedFields } from '@/lib/firestore-optional-fields';
import { newsletterEligible, newsletterAllowsStacking, cartLineEligible, assignedCustomerMatches, restaurantClock, discountMinimumError } from '@/lib/promotion-rules';
import { reserveDiscount, releaseDiscount } from '@/lib/discount-reservations';
import { reconcileStaleDiscountHolds } from '@/lib/server/stale-discount-holds';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { headers, cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/loyalty/stamp-card/portal-http';
import { discountCardCheckoutEnabled, readDiscountCardCheckout, discountCardCheckoutSnapshot, assertDiscountCardCheckoutCurrent } from '@/lib/loyalty/discount-card/checkout';
import Stripe from 'stripe';
import { db } from '@/lib/server/firestore-compat';
import { collection, doc, setDoc, getDoc, runTransaction, updateDoc, where, getDocs, documentId, query, limit, serverTimestamp } from '@/lib/server/firestore-compat';
import type { CartItem, Discount, OrderDetail, Brand, Location, CustomerInfo, Customer, StandardDiscount, Upsell, PaymentDetails, MinimalCartItem, Product, ComboMenu, Topping, ComboSelection, LoyaltySettings, AnonymousCookieConsent } from '@/types';
import { getDiscountByCode, getDiscountById } from '@/lib/server/checkout-discounts';
import { bestAutomaticDiscount, isQuantityMethod, type OfferLine } from '@/lib/automatic-discounts';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { getToppings } from '../superadmin/toppings/actions';
import { getLoyaltySettings } from '../superadmin/loyalty/actions';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { getOrigin } from '@/lib/url';
import { brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';
import { generateOrderId } from '@/lib/order-id';
import { readGuestReceipt, type GuestReceipt } from '@/lib/server/guest-receipt';
import { preparePickupCheckoutAcceptance } from '@/lib/server/accept-pickup-checkout';
import { prepareUnpaidAcceptanceOriginals } from '@/lib/printing/unpaid-acceptance-originals';
import {managedDeliveryRequired} from '@/lib/delivery/quotes/adoption';
import {managedDeliveryRuntimeAvailable,managedDeliveryRuntimeEnvironment} from '@/lib/delivery/quotes/runtime';
import {createNativeManagedCustomerQuote,currentNativeManagedDraft} from '@/lib/delivery/quotes/customer-controller';
import {prepareCustomerQuoteConsumption} from '@/lib/delivery/quotes/customer-store';
import {resolveManagedStripeGateway,type ManagedStripeAccount} from '@/lib/delivery/payments/stripe-authority';
import type {AuthoritativeDraft} from '@/lib/delivery/quotes/customer-boundary';
import type {StoredDeliveryQuote} from '@/lib/delivery/quotes/schema';



// Helper functions for Stripe statement descriptors
function sanitizeDescriptor(s: string, max: number) {
  const allowed = s.toUpperCase().replace(/[^A-Z0-9 .\-&]/g, " ").replace(/\s+/g, " ").trim();
  return allowed.slice(0, max);
}
function makeDescriptorSuffix(city: string) {
  const suffix = sanitizeDescriptor(city || '', 10);
  return /[A-Z]/.test(suffix) ? suffix : 'ORDERFLY';
}

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

    const integrated = await findCheckoutCustomer(brandId, normalizedEmail, customerInfo.phone);
    if (integrated) {
        // Public checkout cannot prove ownership of a new email from a phone number.
        // Otherwise a later email-link Club login could expose this existing profile.
        if (!customerHasEmail(integrated.data(), normalizedEmail))
            throw new Error('Customer identity scope conflict.');
        return { customerRef: integrated.ref, customerDoc: integrated, normalizedEmail };
    }

    const scopedRef = doc(db, 'customers', scopedCustomerId(brandId, normalizedEmail));
    const scopedDoc = await getDoc(scopedRef);
    if (scopedDoc.exists()) {
        const scopedData = scopedDoc.data() as Customer;
        if (scopedData.brandId !== brandId || !customerHasEmail(scopedData, normalizedEmail)) {
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
        if (legacyData.brandId === brandId && customerHasEmail(legacyData, normalizedEmail)) {
            return { customerRef: legacyRef, customerDoc: legacyDoc, normalizedEmail };
        }
    }

    return { customerRef: scopedRef, customerDoc: scopedDoc, normalizedEmail };
}

async function createOrUpdateCustomer(customerInfo: CustomerInfo, brandId: string, locationId: string, newOrderTotal: number, newsletterDiscountId?: string): Promise<string> {
    try {
        const { customerRef, normalizedEmail } = await resolveCheckoutCustomerRef(customerInfo, brandId);
        const normalizedPhone = normalizePhone(customerInfo.phone);
        const emailHash = createHash('sha256')
            .update(`${brandId}\n${normalizedEmail}`, 'utf8')
            .digest('hex');
        const phoneHash = normalizedPhone
            ? createHash('sha256').update(`${brandId}\n${normalizedPhone}`, 'utf8').digest('hex')
            : null;
        const emailIdentityRef = doc(db, 'integrationConsumerCustomerIdentities', emailHash);
        const phoneIdentityRef = phoneHash
            ? doc(db, 'integrationConsumerCustomerPhoneIdentities', phoneHash)
            : null;
        // Request UUIDs are untrusted; only the server cookie capability can link consent.
        const cookieConsentData = await optionalCheckoutValue(() => linkCheckoutConsent(brandId), undefined);
        const now = Date.now();

        return await runTransaction(db, async tx => {
            const emailIdentitySnapshot = await tx.get(emailIdentityRef);
            const phoneIdentitySnapshot = phoneIdentityRef ? await tx.get(phoneIdentityRef) : null;
            const identitySnapshots = [
                { snapshot: emailIdentitySnapshot, identity: 'email' as const },
                ...(phoneIdentitySnapshot ? [{ snapshot: phoneIdentitySnapshot, identity: 'phone' as const }] : []),
            ];
            const indexedCustomerIds = identitySnapshots
                .filter(({ snapshot }) => snapshot.exists())
                .map(({ snapshot }) => {
                    const data = snapshot.data();
                    if (data?.brandId !== brandId || typeof data?.customerId !== 'string' || !data.customerId)
                        throw new Error('Customer identity scope conflict.');
                    return data.customerId as string;
                });
            const uniqueIndexedCustomerIds = [...new Set(indexedCustomerIds)];
            if (uniqueIndexedCustomerIds.length > 1)
                throw new Error('Customer email and phone point to different profiles.');

            const indexedCustomerId = uniqueIndexedCustomerIds[0] || null;
            let targetRef = customerRef;
            const initialCustomerSnapshot = await tx.get(customerRef);
            if (indexedCustomerId && indexedCustomerId !== customerRef.id) {
                if (initialCustomerSnapshot.exists())
                    throw new Error('Customer email and phone point to different profiles.');
                targetRef = doc(db, 'customers', indexedCustomerId);
            }
            const customerSnapshot = targetRef.id === customerRef.id
                ? initialCustomerSnapshot
                : await tx.get(targetRef);
            const customerData = customerSnapshot.exists()
                ? customerSnapshot.data() as Customer
                : null;

            if (customerData && customerData.brandId !== brandId)
                throw new Error('Customer identity scope conflict.');
            // Recheck inside the transaction: a concurrent phone identity must not
            // redirect a new email to somebody else's customer record.
            if (customerData && !customerHasEmail(customerData, normalizedEmail)) {
                throw new Error('Customer identity scope conflict.');
            }
            if (emailIdentitySnapshot.exists()
                && (!customerData || !customerHasEmail(customerData, normalizedEmail))) {
                throw new Error('Customer email identity scope conflict.');
            }
            if (phoneIdentitySnapshot?.exists()
                && (!customerData || !customerHasPhone(customerData, normalizedPhone))) {
                throw new Error('Customer phone identity scope conflict.');
            }

            if (customerData) {
                const updatedData: Partial<Customer> = {
                    fullName: customerInfo.name,
                    ...mergeCustomerIdentity(customerData, normalizedEmail, customerInfo.phone),
                    street: customerInfo.street,
                    zipCode: customerInfo.zipCode,
                    city: customerInfo.city,
                    // These will be updated by the webhook to prevent race conditions
                    // totalOrders: (customerData.totalOrders || 0) + 1,
                    // totalSpend: (customerData.totalSpend || 0) + newOrderTotal,
                    // lastOrderDate: new Date(),
                    locationIds: Array.from(new Set([...(customerData.locationIds || []), locationId])),
                    // Marketing consent is changed only with the durable consent/outbox transaction.
                };

                // The profile keeps the latest choice, so a later yes/no replaces an older one.
                if (cookieConsentData && consentTime(cookieConsentData.timestamp) >= consentTime(customerData.cookie_consent?.timestamp)) {
                    updatedData.cookie_consent = cookieConsentData;
                }

                if (newsletterDiscountId && !customerData.marketingConsent)
                    updatedData.pendingNewsletterDiscountId = newsletterDiscountId;
                tx.set(targetRef, omitUndefinedFields(updatedData), { merge: true });
            } else {
                const identityData = mergeCustomerIdentity({}, normalizedEmail, customerInfo.phone);
                const newCustomer: Customer = {
                    id: targetRef.id,
                    brandId,
                    fullName: customerInfo.name,
                    email: typeof identityData.email === 'string' ? identityData.email : normalizedEmail,
                    normalizedEmail: typeof identityData.normalizedEmail === 'string' ? identityData.normalizedEmail : normalizedEmail,
                    emailAliases: Array.isArray(identityData.emailAliases) ? identityData.emailAliases : [],
                    phone: typeof identityData.phone === 'string' ? identityData.phone : customerInfo.phone,
                    ...(typeof identityData.normalizedPhone === 'string' ? { normalizedPhone: identityData.normalizedPhone } : {}),
                    phoneAliases: Array.isArray(identityData.phoneAliases) ? identityData.phoneAliases : [],
                    street: customerInfo.street,
                    zipCode: customerInfo.zipCode,
                    city: customerInfo.city,
                    country: 'DK',
                    marketingConsent: false,
                    status: 'active',
                    createdAt: new Date(),
                    totalOrders: 0,
                    totalSpend: 0,
                    locationIds: [locationId],
                    loyaltyScore: 0,
                    loyaltyClassification: 'New',
                    cookie_consent: cookieConsentData,
                };
                if (newsletterDiscountId) newCustomer.pendingNewsletterDiscountId = newsletterDiscountId;
                tx.set(targetRef, omitUndefinedFields(newCustomer));
            }

            tx.set(emailIdentityRef, {
                brandId,
                customerId: targetRef.id,
                emailHash,
                source: emailIdentitySnapshot.data()?.source || 'checkout',
                updatedAt: now,
                ...(emailIdentitySnapshot.exists() ? {} : { createdAt: now }),
            }, { merge: true });
            if (phoneIdentityRef && phoneHash) {
                tx.set(phoneIdentityRef, {
                    brandId,
                    customerId: targetRef.id,
                    phoneHash,
                    source: phoneIdentitySnapshot?.data()?.source || 'checkout',
                    updatedAt: now,
                    ...(phoneIdentitySnapshot?.exists() ? {} : { createdAt: now }),
                }, { merge: true });
            }
            return targetRef.id;
        });
    } catch (e: any) {
        console.error('checkout_customer_failed', { code: e?.code || 'unknown' });
        // Preserve known identity safeguards so the outer checkout boundary can
        // show its privacy-safe, actionable message. Unknown storage details
        // stay wrapped and are never returned directly to the customer.
        if (checkoutCustomerIdentityMessage(e)) throw e;
        throw new Error(`Could not create or update customer profile: ${e.message}`);
    }
}

function consentTime(value: unknown): number {
    const date = typeof (value as { toDate?: unknown })?.toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : value instanceof Date ? value : value ? new Date(value as string | number) : null;
    const time = date?.getTime();
    return typeof time === 'number' && Number.isFinite(time) ? time : 0;
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
        return money(Math.min(subtotal, percentageMoney(subtotal, discount.discountValue)));
    }
    return money(Math.min(subtotal, discount.discountValue));
}

type DiscountEligibilityContext = {
    brandId: string;
    locationId: string;
    deliveryType: 'delivery' | 'pickup';
    subtotal: number;
    chargedSubtotal?: number;
    customerId?: string;
    customer?: Customer | null;
    newsletterConsent?: boolean;
    checkoutMode?: CheckoutSignupMode;
    clubEligible?: boolean;
};

function validateDiscountEligibility(discount: Discount, context: DiscountEligibilityContext): string | null {
    const now = new Date();
    const applicationType = discountApplicationType(discount);

    if (discount.brandId !== context.brandId) return 'Rabatten tilhører et andet brand.';
    if (!discount.isActive) return 'Rabatten er ikke længere aktiv.';
    if (!discount.locationIds.includes(context.locationId)) return 'Rabatten gælder ikke for denne restaurant.';
    if (!discount.orderTypes.includes(context.deliveryType)) return 'Rabatten gælder ikke for denne ordretype.';
    if (discount.usageLimit > 0 && discount.usedCount >= discount.usageLimit) return 'Rabatten har nået sin anvendelsesgrænse.';
    const minimumError = discountMinimumError(discount.minOrderValue, context.subtotal,
        applicationType === 'code' ? context.chargedSubtotal : undefined);
    if (minimumError) return minimumError;

    const startDate = asDate(discount.startDate);
    const endDate = asDate(discount.endDate);
    if (startDate && startDate > now) return 'Rabatten er endnu ikke aktiv.';
    if (endDate && endDate < now) return 'Rabatten er udløbet.';

    const currentDay = restaurantClock(now).day;
    if ((discount.activeDays || []).length > 0 && !discount.activeDays.includes(currentDay)) return 'Rabatten gælder ikke i dag.';
    if ((discount.activeTimeSlots || []).length > 0) {
        const currentTime = restaurantClock(now).time;
        if (!discount.activeTimeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end)) return 'Rabatten gælder ikke på dette tidspunkt.';
    }

    if (!assignedCustomerMatches(discount.assignedToCustomerId, context.customerId)) return 'Rabatten er knyttet til en anden kunde.';
    if (discount.firstTimeCustomerOnly && (context.customer?.totalOrders || 0) > 0) return 'Rabatten gælder kun nye kunder.';
    if (discount.perCustomerLimit > 0 && ((context.customer?.discountUsage?.[discount.id] || 0) >= discount.perCustomerLimit)) return 'Du har brugt rabatten det maksimale antal gange.';

    if (applicationType === 'newsletter_signup') {
        if (!signupModeAllows(applicationType, context.checkoutMode ?? 'newsletter')) return 'Tilmeldingskampagnen i checkout er ændret. Genindlæs siden.';
        if (!marketingConfig(discount.brandId)) return 'Nyhedsbrevsrabatten afventer opsætning af nyhedsbrevstjenesten.';
        if (!context.newsletterConsent) return 'Tilmelding til nyhedsbrevet er påkrævet for rabatten.';
        if (!newsletterEligible(!!context.customer?.marketingConsent, context.customer?.pendingNewsletterDiscountId, discount.id, context.customer?.discountUsage?.[discount.id] || 0)) return 'Nyhedsbrevsrabatten er allerede brugt.';
    }

    if (applicationType === 'club_signup' && !context.clubEligible) return 'Club-rabatten er ikke tilgængelig for denne kunde.';
    return null;
}

export type NewsletterDiscountOffer = Pick<Discount, 'id' | 'description' | 'discountType' | 'discountValue' | 'minOrderValue' | 'allowStacking'> & {
    applicationType: 'newsletter_signup' | 'club_signup';
    requiresSignup?: boolean;
};

export async function newsletterSyncAvailableAction(brandId: string): Promise<boolean> {
    return /^[a-zA-Z0-9_-]{1,128}$/.test(brandId) && !!marketingConfig(brandId);
}

export type CheckoutSignupConfig = {
    mode: CheckoutSignupMode;
    clubSignupSuppressed?: boolean;
    clubProgram?: { active: boolean; name: string; consentText: string; consentHelp: string; termsAccept: string; consentVersion: string; termsVersion: string; campaignVersion?: string; welcomeStamps?: number; termsUrl: string };
};

async function checkoutModeForBrand(brandId: string): Promise<CheckoutSignupMode> {
    const snapshot = await getDoc(doc(db, 'loyaltyCampaigns', brandId));
    return checkoutSignupMode(snapshot.exists() ? snapshot.data() : undefined, brandId);
}

export async function getCheckoutSignupAction(brandId: string, locationId?: string): Promise<CheckoutSignupConfig> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(brandId)) return {mode:'none'};
    const mode = await checkoutModeForBrand(brandId);
    if (mode !== 'club') return {mode};
    const brand = await getBrandById(brandId);
    if (!brand?.slug) return {mode:'none'};
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (locationId && token && await readDiscountCardCheckout(getAdminDb(), {brandId,brandSlug:brand.slug,locationId,token,now:Date.now()})) {
      return {mode:'none',clubSignupSuppressed:true};
    }
    const {resolveBrand, programForPortal} = await import('@/lib/loyalty/stamp-card/membership');
    const resolved = await resolveBrand(getAdminDb(), brand.slug);
    if (resolved.brandId !== brandId) return {mode:'none'};
    const programme = await programForPortal(getAdminDb(), resolved);
    if (!programme.active) return {mode:'none'};
    return {mode,clubProgram:{active:programme.active,name:programme.name,consentText:programme.consentText,
        consentHelp:programme.consentHelp,termsAccept:programme.termsAccept,consentVersion:programme.consentVersion,
        termsVersion:programme.termsVersion,campaignVersion:programme.campaigns?.version,welcomeStamps:programme.campaigns?.welcomeStamps,termsUrl:`/${brand.slug}/club/vilkaar`}};
}

export async function getNewsletterSignupDiscountAction(
    brandId: string, locationId: string, subtotal: number, deliveryType: 'delivery' | 'pickup',
    email?: string, bases?: { undiscounted: number; charged: number }
): Promise<NewsletterDiscountOffer | null> {
    if (!email || !email.includes('@')) return null;
    const mode = await checkoutModeForBrand(brandId);
    const resolved = await resolveCheckoutCustomerRef({ email } as CustomerInfo, brandId);
    const customer = resolved.customerDoc.exists() ? resolved.customerDoc.data() as Customer : undefined;
    const discountsQuery = query(collection(db, 'discounts'), where('brandId', '==', brandId));
    const snapshot = await getDocs(discountsQuery);
    let best: NewsletterDiscountOffer | null = null, bestSaving = 0;
    for (const discountDoc of [...snapshot.docs].sort((a, b) => a.id.localeCompare(b.id))) {
        const data = discountDoc.data(), applicationType = discountApplicationType(data);
        if (applicationType !== 'newsletter_signup' && applicationType !== 'club_signup') continue;
        const personalClub = applicationType === 'club_signup' && clubDiscountEligible(customer?.pendingClubDiscountId, discountDoc.id, customer?.discountUsage?.[discountDoc.id] || 0);
        if (!personalClub && !signupModeAllows(applicationType, mode)) continue;
        const clubEligible = applicationType === 'club_signup' && await getClubSignupDiscountEligibility({db:getAdminDb(),brandId,email,discountId:discountDoc.id,now:Date.now()});
        if (applicationType === 'club_signup' && !clubEligible) continue;
        const discount = {...data,id:discountDoc.id,applicationType,startDate:asDate(data.startDate),endDate:asDate(data.endDate)} as Discount;
        const base = bases ? (newsletterAllowsStacking(discount) ? bases.charged : bases.undiscounted) : subtotal;
        if (!Number.isFinite(base) || base < 0 || base > subtotal) continue;
        const error = validateDiscountEligibility(discount,{brandId,locationId,deliveryType,subtotal:base,
            newsletterConsent:true,checkoutMode:mode,clubEligible,customerId:resolved.customerRef.id,customer});
        if (error) continue;
        const saving = discount.discountType === 'percentage' ? percentageMoney(base,Math.min(100,discount.discountValue)) : money(Math.min(base,discount.discountValue));
        if (saving <= bestSaving) continue;
        bestSaving = saving;
        best = {id:discount.id,description:discount.description,discountType:discount.discountType,discountValue:discount.discountValue,
            minOrderValue:discount.minOrderValue,allowStacking:newsletterAllowsStacking(discount),applicationType,
            ...(applicationType === 'club_signup' ? {requiresSignup:!personalClub} : {})};
    }
    return best;
}


// This function is now obsolete. The logic has been integrated into the Stripe checkout action.
// We keep it here to avoid breaking any potential old references, but it should be considered deprecated.
export async function createAndSaveOrder(
  // ... parameters
): Promise<{ order: OrderDetail; brandSlug: string; locationSlug: string }> {
    throw new Error("createAndSaveOrder is deprecated. Order creation is now handled by the Stripe checkout flow.");
}


export async function getDiscountCardCheckoutEnabledAction(brandId:string,locationId:string):Promise<boolean> {
  return discountCardCheckoutEnabled(getAdminDb(),brandId,locationId);
}

/** Personal repeated benefit. Public email lookup alone cannot reveal or grant it. */
export async function getDiscountCardCheckoutOfferAction(brandId: string, brandSlug: string, locationId: string, email: string): Promise<{name:string;percentage:number}|null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !email || !zEmailValid(email)) return null;
  const card = await readDiscountCardCheckout(getAdminDb(),{brandId,brandSlug,locationId,token,email,now:Date.now()});
  return card ? {name:card.groupName,percentage:card.percentage} : null;
}
function zEmailValid(email:string) { return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }

async function resolveAuthoritativeCheckoutPricing(input: {
  cartItems: MinimalCartItem[]; customerInfo: CustomerInfo; deliveryType:'delivery'|'pickup';
  brandId:string;locationId:string;brandSlug:string;brand:Brand;location:Location;
  paymentDetails:Omit<PaymentDetails,'paymentRefId'>;appliedDiscountId:string|null;
  enforceLegacyDeliveryMinimum?:boolean;
}) {
  let {cartItems}=input;
  const {customerInfo,deliveryType,brandId,locationId,brandSlug,brand,location,paymentDetails,appliedDiscountId}=input;
    const resolvedCustomer = await resolveCheckoutCustomerRef(customerInfo, brand.id);
    const existingCustomer = resolvedCustomer.customerDoc.exists()
      ? resolvedCustomer.customerDoc.data() as Customer
      : null;

    const checkoutMode = await checkoutModeForBrand(brandId);
    const discountCardToken = (await cookies()).get(SESSION_COOKIE)?.value;
    if (customerInfo.subscribeToClub && discountCardToken && await readDiscountCardCheckout(getAdminDb(), {brandId,brandSlug,locationId,token:discountCardToken,now:Date.now()})) {
      throw new Error('Du har allerede et aktivt rabatkort. Genindlæs kassen uden Club-tilmelding.');
    }
    if (customerInfo.subscribeToClub && checkoutMode !== 'club') throw new Error('Club-tilmelding er ikke aktiv i checkout. Genindlæs siden.');
    const clubSignupInput = () => ({db:getAdminDb(),brandId,brandSlug,name:customerInfo.name,email:customerInfo.email,
      newsletterConsent:customerInfo.subscribeToNewsletter,termsAccepted:customerInfo.clubTermsAccepted === true,
      consentVersion:customerInfo.clubConsentVersion || '',termsVersion:customerInfo.clubTermsVersion || '',campaignVersion:customerInfo.clubCampaignVersion,now:Date.now()});
    let clubPreflight: {eligible:boolean;customerId?:string} | null = null;

    const chargedItemsSubtotal = cartItems.reduce((sum, item) => {
      const lineTotal = toNumber(item.totalPrice);
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || lineTotal < 0) throw new Error('Ugyldig mængde eller pris i kurven.');
      return sumMoney([sum, lineTotal]);
    }, 0);

    const activeStandardDiscounts = await getActiveStandardDiscounts({
      brandId,
      locationId,
      deliveryType,
    });

    // Resolve eligibility from native catalog records; the browser cannot mark a combo as a product.
    const quantityLines: OfferLine[] = [];
    const resolvedLines = await Promise.all(cartItems.map(async item => {
      if (!item.id) throw new Error('Opdater din kurv, før du går til betaling.');
      let [productSnap, comboSnap] = await Promise.all([
        getDoc(doc(db, 'products', item.id)), getDoc(doc(db, 'comboMenus', item.id)),
      ]);
      if (!productSnap.exists() && !comboSnap.exists() && item.id.endsWith('-offer')) {
        productSnap = await getDoc(doc(db, 'products', item.id.slice(0, -6)));
      }
      const catalog = productSnap.exists() ? { ...productSnap.data(), id: productSnap.id } as Product : null;
      const combo = comboSnap.exists() ? { ...comboSnap.data(), id: comboSnap.id } as ComboMenu : null;
      const record = catalog || combo;
      if (!record || record.brandId !== brandId || record.isActive !== true || (catalog && isSyntheticProduct(catalog)) || (record.locationIds?.length && !record.locationIds.includes(locationId))) throw new Error('Varen kan ikke bestilles fra denne restaurant.');
      const price = combo ? (deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice)
        : (deliveryType === 'delivery' ? (catalog!.priceDelivery ?? catalog!.price) : catalog!.price);
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) throw new Error('Varen har ingen tilgængelig pris. Genindlæs menuen.');
      return { productSnap, catalog, combo, price };
    }));
    const selectedProductIds = [...new Set(cartItems.flatMap(item => item.comboSelections?.flatMap(group => group.products.map(product => product.id)) || []))];
    if (selectedProductIds.length > 400) throw new Error('Too many combo selections.');
    const needsOptions = resolvedLines.some(line => line.catalog?.toppingGroupIds?.length);
    const [comboProducts, toppingRows, groupRows] = await Promise.all([
      Promise.all(selectedProductIds.map(id => getDoc(doc(db, 'products', id)))),
      needsOptions ? getDocs(query(collection(db, 'toppings'), where('locationIds', 'array-contains', locationId))) : { docs: [] },
      needsOptions ? getDocs(query(collection(db, 'topping_groups'), where('locationIds', 'array-contains', locationId))) : { docs: [] },
    ]);
    const catalogProducts = new Map(resolvedLines.flatMap(line => line.catalog ? [[line.catalog.id, line.catalog] as const] : []));
    for (const snapshot of comboProducts) if (snapshot.exists()) {
      const product = { ...snapshot.data(), id: snapshot.id } as Product;
      if (isSyntheticProduct(product)) throw new Error('Varen kan ikke bestilles fra denne restaurant.');
      catalogProducts.set(snapshot.id, product);
    }
    const validated = validateCheckoutItems(cartItems, {
      products: [...catalogProducts.values()], combos: resolvedLines.flatMap(line => line.combo ? [line.combo] : []),
      toppings: toppingRows.docs.map(row => ({ ...row.data(), id: row.id })) as Topping[],
      groups: groupRows.docs.map(row => ({ ...row.data(), id: row.id })) as import('@/types').ToppingGroup[],
      discounts: [], upsells: [],
    }, { brandId, locationId, deliveryType });
    cartItems = validated.items;
    // Existing store policy: delivery minimum is the catalog subtotal including
    // options, before promotions and excluding delivery/bag/admin fees.
    if (input.enforceLegacyDeliveryMinimum !== false && deliveryType === 'delivery' && validated.subtotal < Math.max(0, toNumber(location.minOrder))) {
      throw new Error(`Levering kræver varer for mindst ${Number(location.minOrder).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr. før rabatter og gebyrer.`);
    }
    const itemDiscountTotal = money(Math.max(0, validated.subtotal - chargedItemsSubtotal));
    const upsellRows = await getDocs(query(collection(db, 'upsells'), where('brandId', '==', brandId), where('isActive', '==', true)));
    const upsells = upsellRows.docs.map(row => ({ ...row.data(), id: row.id })) as Upsell[];
    const verifiedUpsellIds = validateCheckoutPrices(cartItems, resolvedLines.map(({productSnap,catalog,combo,price},i) => ({
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
    const eligibleSubtotal = sumMoney(eligibleLines);

    const automaticCartDiscount = bestAutomaticDiscount(activeStandardDiscounts, eligibleSubtotal, quantityLines);
    const discountCardInput = {brandId,brandSlug,locationId,token:discountCardToken,customerId:resolvedCustomer.customerRef.id,email:customerInfo.email,now:Date.now()};
    const discountCardEntitlement = discountCardToken ? await readDiscountCardCheckout(getAdminDb(),discountCardInput) : null;

    let selectedDiscount: Discount | null = null;
    let selectedDiscountAmount = 0;
    if (appliedDiscountId) {
      selectedDiscount = await getDiscountById(appliedDiscountId);
      if (!selectedDiscount) throw new Error('The selected discount no longer exists.');
      if (customerInfo.subscribeToClub) {
        clubPreflight = await validateClubCheckoutSignup({...clubSignupInput(),discountId:selectedDiscount.applicationType === 'club_signup' ? selectedDiscount.id : undefined});
        if (!clubPreflight.eligible) throw new Error('Club-tilmeldingen eller kampagnen er ændret. Genindlæs siden.');
      }
      const personalClub = selectedDiscount.applicationType === 'club_signup' && clubDiscountEligible(existingCustomer?.pendingClubDiscountId, selectedDiscount.id, existingCustomer?.discountUsage?.[selectedDiscount.id] || 0);
      const clubEligible = selectedDiscount.applicationType === 'club_signup' && (personalClub || !!clubPreflight?.eligible)
        && await getClubSignupDiscountEligibility({db:getAdminDb(),brandId,email:customerInfo.email,discountId:selectedDiscount.id,now:Date.now()});
      // Use validated charged merchandise, including options/combos, only when
      // the persisted newsletter campaign explicitly enables item stacking.
      const prizeIndex=selectedDiscount.gameProductId?resolvedLines.findIndex((line,index)=>line.catalog?.id===selectedDiscount!.gameProductId&&eligibleLines[index]>0):-1;
      if(selectedDiscount.gameProductId&&prizeIndex<0)throw new Error('Add the prize product to your basket before using this code.');
      const selectedSubtotal=prizeIndex>=0?money(Math.min(resolvedLines[prizeIndex].price,eligibleLines[prizeIndex])):newsletterAllowsStacking(selectedDiscount) ? chargedItemsSubtotal : eligibleSubtotal;
      const eligibilityError = validateDiscountEligibility(selectedDiscount, {
        brandId,
        locationId,
        deliveryType,
        subtotal: selectedSubtotal,
        chargedSubtotal: selectedDiscount.gameProductId ? selectedSubtotal : chargedItemsSubtotal,
        customerId: resolvedCustomer.customerRef.id,
        customer: existingCustomer,
        newsletterConsent: customerInfo.subscribeToNewsletter,
        checkoutMode, clubEligible,
      });
      if (eligibilityError) throw new Error(eligibilityError);
      selectedDiscountAmount = selectedDiscount.gameProductId ? selectedSubtotal : calculateDiscountAmount(selectedDiscount, selectedSubtotal);
    }

    if (customerInfo.subscribeToClub && !clubPreflight) {
      clubPreflight = await validateClubCheckoutSignup(clubSignupInput());
      if (!clubPreflight.eligible) throw new Error('Club-tilmeldingen er ændret. Genindlæs siden.');
    }
    const discountCard = discountCardCheckoutSnapshot(discountCardEntitlement,ore(eligibleSubtotal),ore(Math.max(selectedDiscountAmount,automaticCartDiscount?.amount || 0)));
    const manualDiscountWins = !discountCard && selectedDiscountAmount > (automaticCartDiscount?.amount || 0);
    const cartDiscountTotal = discountCard ? discountCard.amountOre / 100 : manualDiscountWins
      ? selectedDiscountAmount
      : (automaticCartDiscount?.amount || 0);
    const cartDiscountName = discountCard ? `Rabatkort: ${discountCard.groupName}` : manualDiscountWins
      ? (selectedDiscount?.applicationType === 'newsletter_signup' ? 'Newsletter signup' : selectedDiscount?.applicationType === 'club_signup' ? 'Club signup' : selectedDiscount?.code)
      : automaticCartDiscount?.name;
    const appliedDiscountIdForOrder = manualDiscountWins ? selectedDiscount?.id || null : null;

    const hasFreeDelivery = deliveryType === 'delivery' && activeStandardDiscounts.some(discount =>
      discount.discountType === 'free_delivery' && chargedItemsSubtotal >= (discount.minOrderValue || 0)
    );
    const effectiveDeliveryFee = deliveryType === 'delivery' && !hasFreeDelivery
      ? money(Math.max(0, toNumber(location.deliveryFee)))
      : 0;
    const effectiveBagFee = money(Math.min(Math.max(0, toNumber(paymentDetails.bagFee)), Math.max(0, toNumber(brand.bagFee))));
    const subtotalAfterDiscount = money(Math.max(0, chargedItemsSubtotal - cartDiscountTotal));
    const effectiveAdminFee = brand.adminFeeType === 'percentage'
      ? percentageMoney(subtotalAfterDiscount, Math.max(0, toNumber(brand.adminFee)))
      : money(Math.max(0, toNumber(brand.adminFee)));
    const totalAmount = sumMoney([subtotalAfterDiscount, effectiveDeliveryFee, effectiveBagFee, effectiveAdminFee]);
    const serverPaymentDetails: Omit<PaymentDetails, 'paymentRefId'> = {
      ...paymentDetails,
      subtotal: validated.subtotal,
      itemDiscountTotal,
      cartDiscountTotal,
      cartDiscountName,
      discountTotal: sumMoney([itemDiscountTotal, cartDiscountTotal]),
      deliveryFee: effectiveDeliveryFee,
      bagFee: effectiveBagFee,
      adminFee: effectiveAdminFee,
      vatAmount: money(totalAmount * ((brand.vatPercentage ?? 25) / (100 + (brand.vatPercentage ?? 25)))),
    };

  return {cartItems,discountCard,discountCardInput,clubSignupInput,selectedDiscount,verifiedUpsellIds,
    appliedDiscountIdForOrder,cartDiscountTotal,serverPaymentDetails,totalAmount,subtotalAfterDiscount,
    freeDeliveryCampaignIds:activeStandardDiscounts.filter(d=>d.discountType==='free_delivery'&&subtotalAfterDiscount>=(d.minOrderValue||0)).map(d=>d.id).sort()};
}

export async function requestManagedDeliveryQuoteAction(input: {
  checkoutKey:string;cartItems:MinimalCartItem[];customerInfo:CustomerInfo;brandId:string;locationId:string;
  paymentDetails:Omit<PaymentDetails,'paymentRefId'>;appliedDiscountId:string|null;brandSlug:string;locationSlug:string;deliveryTime?:string;
}):Promise<import('@/lib/delivery/quotes/customer-boundary').CustomerQuoteDto|import('@/lib/delivery/quotes/customer-boundary').CustomerQuoteFailure> {
  // No approved live route source is registered. Do not expose private provider prices or pretend a quote exists.
  const failure={ok:false as const,code:'delivery_unavailable' as const,message:'Levering er ikke tilgængelig lige nu. Vælg afhentning.'};
  if (!input || !/^[a-f0-9]{64}$/.test(input.checkoutKey)) return {...failure,code:'invalid_request'};
  const parsed=deliveryQuoteRequestSchema.safeParse([input.cartItems,input.customerInfo,'delivery',input.brandId,input.locationId,input.paymentDetails,input.appliedDiscountId,input.brandSlug,input.locationSlug,input.deliveryTime,undefined]);
  if(!parsed.success)return {...failure,code:'invalid_request'};
  const [items,customer,,b,l,payment,discount,bs,ls,time]=parsed.data;
  input={...input,cartItems:items,customerInfo:customer,brandId:b,locationId:l,paymentDetails:payment,appliedDiscountId:discount,brandSlug:bs,locationSlug:ls,deliveryTime:time};
  try {
    if(!await managedDeliveryRuntimeAvailable({brandId:input.brandId,locationId:input.locationId}))return failure;
    const [brand,location]=await Promise.all([getBrandById(input.brandId),getLocationById(input.locationId)]);
    if(!brand||!location||location.brandId!==brand.id||brand.slug!==input.brandSlug||location.slug!==input.locationSlug)return {...failure,code:'invalid_request'};
    const priced=await resolveAuthoritativeCheckoutPricing({...input,brand,location,deliveryType:'delivery',enforceLegacyDeliveryMinimum:false});
    if(input.deliveryTime && input.deliveryTime!=='asap')resolveFulfillmentTime(location,'delivery',input.deliveryTime);
    const fulfillmentAt=resolveFulfillmentTime(location,'pickup','asap');
    return await createNativeManagedCustomerQuote({brand,location,customer:input.customerInfo,cartItems:priced.cartItems,payment:priced.serverPaymentDetails,
      subtotalAfterDiscount:priced.subtotalAfterDiscount,freeDeliveryCampaignIds:priced.freeDeliveryCampaignIds,fulfillmentAt,checkoutKey:input.checkoutKey,deliverySelection:input.deliveryTime||'asap'});
  }catch{return failure;}
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
    managedDeliveryAcceptance?: {checkoutKey:string;quoteId:string;quoteToken:string;checkoutFingerprint:string;customerFeeMinor:number;checkoutTotalMinor:number;currency:string}
): Promise<{ success: boolean; url?: string | null; orderId?: string; error?: string; retryable?: boolean }> {
  let reservedOrderId: string | undefined;
  let sessionRequestStarted = false;
  let stage = 'configuration';
  try {

    const parsed = checkoutRequestSchema.safeParse([cartItems, customerInfo, deliveryType, brandId, locationId, paymentDetails, appliedDiscountId, brandSlug, locationSlug, deliveryTime, anonymousConsentId]);
    if (!parsed.success) return { success: false, retryable: true, error: 'Kontrollér din kurv og dine oplysninger, og genindlæs kassen.' };
    [cartItems, customerInfo, deliveryType, brandId, locationId, paymentDetails, appliedDiscountId, brandSlug, locationSlug, deliveryTime, anonymousConsentId] = parsed.data;
    if(managedDeliveryAcceptance!==undefined&&!managedDeliveryAcceptanceSchema.safeParse(managedDeliveryAcceptance).success)return {success:false,retryable:true,error:'Leveringstilbuddet er ugyldigt. Beregn levering igen.'};
    const managedRuntime = deliveryType === 'delivery' ? await managedDeliveryRuntimeAvailable({brandId,locationId}) : null;
    const requiresManaged = deliveryType === 'delivery' && await managedDeliveryRequired({brandId,locationId});
    if (requiresManaged && !managedRuntime) return {success:false,retryable:true,error:'Levering er ikke tilgængelig lige nu. Vælg afhentning.'};
    if ((managedRuntime || requiresManaged) && !managedDeliveryAcceptance) return {success:false,retryable:true,error:'Beregn og acceptér leveringstilbuddet før betaling.'};
    if (managedDeliveryAcceptance !== undefined && (deliveryType!=='delivery' || !managedRuntime)) return {success:false,retryable:true,error:'Levering er ikke tilgængelig lige nu. Vælg afhentning.'};
    stage = 'validation';

    const origin = await getOrigin();
    // Return addresses stay short on the brand's own subdomain (#282), unchanged on orderfly.dk.
    const checkoutPath = storefrontPath(brandSlug, brandSlugFromHost(origin.split('://').pop()) === brandSlug, locationSlug, 'checkout');
    
    const [brand, location] = await Promise.all([
        getBrandById(brandId),
        getLocationById(locationId),
    ]);
    if (!brand || !location || location.brandId !== brand.id) throw new Error("Brand or location not found in the requested tenant scope");
    const paymentMethod = customerInfo.paymentMethod || 'online';
    assertCheckoutPaymentMethod(location, deliveryType, paymentMethod);
    let stripe: Stripe | undefined;
    let managedStripeAccount:ManagedStripeAccount|undefined;
    let managedQuote:StoredDeliveryQuote|undefined;
    let managedDraft:AuthoritativeDraft|undefined;
    if(managedDeliveryAcceptance && paymentMethod!=='online')throw Error('Levering kræver online betaling.');
    if (paymentMethod === 'online') {
      stage = 'configuration';
      if(managedDeliveryAcceptance){
        const environment=managedDeliveryRuntimeEnvironment();
        if(!environment)throw Error('delivery_environment_unconfigured');
        const gateway=await resolveManagedStripeGateway();
        if(gateway.binding.livemode!==(environment==='production'))throw Error('delivery_payment_environment_mismatch');
        stripe=gateway.stripe;managedStripeAccount=gateway.binding;
      }
      else {const stripeSecretKey = await getActiveStripeSecretKey();
      if (!stripeSecretKey) throw new Error('Stripe API key is not configured.');
      stripe = new Stripe(stripeSecretKey, { timeout: 15000, maxNetworkRetries: 2 });}
      stage = 'validation';
    }
    
    if (brand.slug !== brandSlug || location.slug !== locationSlug) throw new Error('Restaurantens adresse er ændret. Genindlæs menuen.');
    let fulfillmentAt = resolveFulfillmentTime(location, deliveryType, deliveryTime);
    const priced = await resolveAuthoritativeCheckoutPricing({cartItems,customerInfo,deliveryType,brandId,locationId,brandSlug,brand,location,paymentDetails,appliedDiscountId,enforceLegacyDeliveryMinimum:!managedDeliveryAcceptance});
    cartItems=priced.cartItems;
    const {discountCard,discountCardInput,clubSignupInput,selectedDiscount,verifiedUpsellIds,appliedDiscountIdForOrder,
      cartDiscountTotal,serverPaymentDetails}=priced;
    let totalAmount=priced.totalAmount;
    if(managedDeliveryAcceptance){
      managedDraft=await currentNativeManagedDraft({brand,location,customer:customerInfo,cartItems,payment:serverPaymentDetails,
        subtotalAfterDiscount:priced.subtotalAfterDiscount,freeDeliveryCampaignIds:priced.freeDeliveryCampaignIds,fulfillmentAt,checkoutKey:managedDeliveryAcceptance.checkoutKey,deliverySelection:deliveryTime||'asap'});
      const proof={...managedDeliveryAcceptance,acceptedFeeMinor:managedDeliveryAcceptance.customerFeeMinor};
      const preflight=await getAdminDb().runTransaction(tx=>prepareCustomerQuoteConsumption(tx,proof,managedDraft!,'preflight'));
      managedQuote=preflight.quote;
      totalAmount=sumMoney([priced.subtotalAfterDiscount,serverPaymentDetails.bagFee||0,serverPaymentDetails.adminFee||0,managedQuote.economics.customerFee.amountMinor/100]);
      if(totalAmount<=0)throw Error('Levering kræver en positiv online betaling. Vælg afhentning.');
      if(managedDeliveryAcceptance.currency!==managedQuote.economics.customerFee.currency||managedDeliveryAcceptance.checkoutTotalMinor!==ore(totalAmount))throw Error('Leveringsprisen er ændret. Beregn levering igen.');
      serverPaymentDetails.deliveryFee=managedQuote.economics.customerFee.amountMinor/100;
      serverPaymentDetails.vatAmount=money(totalAmount*((brand.vatPercentage??25)/(100+(brand.vatPercentage??25))));
      if(Date.now()+60000>=managedQuote.expiresAtMs)throw Error('Leveringstilbuddet udløber snart. Beregn levering igen.');
      fulfillmentAt=managedDraft.binding.fulfillmentAt;
    }

    // Modern checkout always sends the displayed cart discount (including zero).
    // Reject a stale quote before consent, customer/order writes, or reservations.
    if (typeof paymentDetails.cartDiscountTotal === 'number' && (
      ore(paymentDetails.cartDiscountTotal) !== ore(cartDiscountTotal) ||
      ore(paymentDetails.discountTotal) !== ore(serverPaymentDetails.discountTotal) ||
      ore(paymentDetails.subtotal) !== ore(serverPaymentDetails.subtotal) ||
      ore(paymentDetails.deliveryFee) !== ore(serverPaymentDetails.deliveryFee) ||
      ore(paymentDetails.adminFee || 0) !== ore(serverPaymentDetails.adminFee || 0)
    )) throw new Error('Priser eller tilbud er ændret. Opdatér kurven og kontrollér beløbet, før du fortsætter.');

    stage = 'customer';
    const customerId = await createOrUpdateCustomer(customerInfo, brand.id, location.id, totalAmount, selectedDiscount?.applicationType === 'newsletter_signup' ? selectedDiscount.id : undefined);

    if (discountCard && customerId !== discountCard.customerId) throw new Error('Kundeidentiteten er ændret. Opdatér kassen.');
    if (customerInfo.subscribeToClub) {
      stage = 'club_signup';
      const enrolled = await prepareClubCheckoutSignup({...clubSignupInput(),now:Date.now(),discountId:selectedDiscount?.applicationType === 'club_signup' ? selectedDiscount.id : undefined});
      if (enrolled.customerId !== customerId) throw new Error('Club- og ordreprofilen matcher ikke. Genindlæs siden.');
    }
    if (customerInfo.subscribeToNewsletter && !customerInfo.subscribeToClub) {
      stage = 'newsletter_consent';
      await recordNewsletterConsent(getAdminDb(),{brandId:brand.id,brandName:brand.name,locationId:location.id,customerId,email:customerInfo.email,
        submissionId:customerInfo.newsletterConsentId,version:customerInfo.newsletterConsentVersion});
    }

    // A missed Stripe expiry webhook must not keep a limited code blocked (#210).
    // Reconcile before the order exists, so a still-full code is rejected
    // without leaving a canceled order behind.
    if (appliedDiscountIdForOrder) {
      stage = 'reservation_reconcile';
      await reconcileStaleDiscountHolds(brandId, appliedDiscountIdForOrder);
    }

    // Step 1: Pre-create order with 'Pending' status
    const orderId = generateOrderId();
    const cancelToken = randomBytes(32).toString('hex');
    const receiptToken = randomBytes(32).toString('hex');
    const orderRef = doc(db, 'orders', orderId);

    stage = 'order';
    const orderData = omitUndefinedFields({
        id: orderId,
        createdAt: serverTimestamp(),
        status: 'Pending',
        paymentStatus: 'Pending',
        paymentMethod: paymentMethod === 'pay_at_pickup' ? 'PayAtPickup' : 'Stripe',
        brandId,
        locationId,
        productItems: cartItems,
        verifiedUpsellIds,
        totalAmount,
        paymentDetails: serverPaymentDetails,
        appliedDiscountId: appliedDiscountIdForOrder,
        ...(discountCard ? {discountCard} : {}),
        cancelTokenHash: createHash('sha256').update(cancelToken).digest('hex'),
        receiptTokenHash: createHash('sha256').update(receiptToken).digest('hex'),
        ...(customerInfo.analyticsConsent && customerInfo.analyticsSessionId ? {analytics: {
          sessionId: customerInfo.analyticsSessionId, deviceType: customerInfo.analyticsDevice || 'desktop',
          ...(customerInfo.analyticsAttribution ? { attribution: customerInfo.analyticsAttribution } : {}),
        }} : {}),
        customerName: customerInfo.name,
        customerContact: customerInfo.email,
        deliveryType: deliveryType === 'delivery' ? 'Delivery' : 'Pickup',
        deliveryTime: displayFulfillmentTime(managedQuote?.fulfillment.desiredDelivery.kind==='scheduled'?managedQuote.fulfillment.desiredDelivery.interval.earliest:fulfillmentAt),
        fulfillmentAt,
        brandName: brand.name,
        locationName: location.name,
        customerDetails: {
            id: customerId,
            // Retain the validated checkout contact for this order's kitchen ticket.
            // Do not resolve a mutable customer profile when rendering old orders.
            phone: customerInfo.phone,
            ...(managedQuote ? {deliveryInstructions:customerInfo.deliveryInstructions||''} : {}),
            address: deliveryType === 'delivery' ? `${customerInfo.street}, ${customerInfo.zipCode} ${customerInfo.city}` : 'For Pickup',
        },
        ...(paymentMethod === 'online' ? { psp: { provider: 'stripe' } } : {}),
        ...(managedQuote ? {managedDelivery:{version:1,providerId:managedQuote.binding.providerId,quoteRef:managedQuote.quoteRef,requestDigest:managedQuote.contentDigest},managedStripeAccount} : {}),
    });
    // Six-digit order references can collide. Never overwrite another order or
    // reuse its Stripe idempotency key; a collision must fail before payment.
    await runTransaction(db, async (transaction, context) => {
      const existing = await transaction.get(orderRef);
      if (discountCard) await assertDiscountCardCheckoutCurrent(context.db,{...discountCardInput,now:Date.now()},discountCard,context.transaction);
      if (existing.exists()) throw new Error('Ordrenummeret er allerede i brug. Prøv igen.');
      const claim=managedQuote&&managedDraft&&managedDeliveryAcceptance ? await prepareCustomerQuoteConsumption(context.transaction,{...managedDeliveryAcceptance,acceptedFeeMinor:managedDeliveryAcceptance.customerFeeMinor},managedDraft,orderId):null;
      claim?.apply();
      transaction.set(orderRef, orderData);
    });


    stage = 'reservation';
    reservedOrderId = orderId;
    await reserveDiscount(orderId, appliedDiscountIdForOrder, customerId, brandId);

    if (paymentMethod === 'pay_at_pickup') {
      // Only an order with a committed capacity hold can enter the kitchen.
      // Re-read configuration in the acceptance transaction so concurrent
      // disable/reassignment cannot admit a new pickup order.
      stage = 'pickup_acceptance';
      sessionRequestStarted = true; // A lost acceptance response is not a rejection.
      let preparationRejected = false;
      try {
        await runTransaction(db, async (_transaction, context) => {
          // SDK retries discard the previous attempt. Only this attempt's
          // read-only preparation failure proves that no acceptance committed.
          preparationRejected = false;
          const acceptance = await preparePickupCheckoutAcceptance(context, { orderId, brandId, locationId, selection: deliveryTime });
          const printPlan = await (async () => {
            try {
              return await prepareUnpaidAcceptanceOriginals(context, acceptance.capability);
            } catch (error) {
              preparationRejected = true;
              throw error;
            }
          })();
          if (discountCard) {
            try {
              await assertDiscountCardCheckoutCurrent(context.db,{...discountCardInput,now:Date.now()},discountCard,context.transaction);
            } catch (error) {
              // Only proven ineligibility is definitive; native read/commit
              // uncertainty keeps the existing conservative reconciliation path.
              if ((error as { code?: string })?.code === 'discount_card_changed') preparationRejected = true;
              throw error;
            }
          }
          acceptance.apply();
          printPlan?.apply();
          fulfillmentAt = acceptance.fulfillmentAt;
        });
      } catch (error) {
        if (preparationRejected || (error as { code?: string })?.code === 'pickup_order_rejected') sessionRequestStarted = false;
        throw error;
      }
      return { success: true, orderId, url: `${origin}${checkoutPath}/confirmation?order_id=${orderId}&receipt_token=${receiptToken}` };
    }
    if (!stripe) throw new Error('Stripe API key is not configured.');

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => {
        if (item.unitPrice == null) {
            throw new Error(`Missing unitPrice for cart item: ${item.name ?? 'unknown'}`);
        }

        return {
            price_data: {
                currency: 'dkk',
                product_data: { name: item.name, description: [...(item.toppings || []), ...(item.comboSelections || []).map(group => `${group.groupName}: ${group.products.map(product => product.name).join(', ')}`)].join('; ').slice(0, 500) || undefined },
                unit_amount: ore(item.totalPrice / item.quantity),
            },
            quantity: item.quantity,
        };
    });

    if (deliveryType === 'delivery' && serverPaymentDetails.deliveryFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Leveringsgebyr' }, unit_amount: ore(serverPaymentDetails.deliveryFee) },
            quantity: 1,
        });
    }
    if (serverPaymentDetails.bagFee && serverPaymentDetails.bagFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Pose' }, unit_amount: ore(serverPaymentDetails.bagFee) },
            quantity: 1,
        });
    }
    if (serverPaymentDetails.adminFee && serverPaymentDetails.adminFee > 0) {
        line_items.push({
            price_data: { currency: 'dkk', product_data: { name: 'Administrationsgebyr' }, unit_amount: ore(serverPaymentDetails.adminFee) },
            quantity: 1,
        });
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        customer_email: customerInfo.email,
        success_url: `${origin}${checkoutPath}/confirmation?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}&receipt_token=${receiptToken}`,
        cancel_url: `${origin}${checkoutPath}/cancel?order_id=${orderId}&token=${cancelToken}`,
        metadata: {
            orderId,
            brandId,
            locationId,
            appliedDiscountId: appliedDiscountIdForOrder || '',
        },
        payment_intent_data: {
            statement_descriptor_suffix: makeDescriptorSuffix(location.city),
            metadata: { orderId, brandId, locationId },
        },
    };

    stage = 'coupon';
    if (cartDiscountTotal > 0) {
        const coupon = await stripe.coupons.create({
            amount_off: ore(cartDiscountTotal),
            currency: 'dkk',
            duration: 'once',
            name: serverPaymentDetails.cartDiscountName || 'Discount',
        });
        sessionParams.discounts = [{ coupon: coupon.id }];
    }
    
    // Retry network failures with the same parameters/idempotency key in the SDK.
    // A confirmed 4xx rejection has no payable session; a timeout/5xx is uncertain.
    stage = 'validation';
    // Optional reads/customer creation may take time. Recheck immediately before payment.
    if(managedQuote){if(Date.now()+60000>=managedQuote.expiresAtMs)throw Error('Leveringstilbuddet er udløbet. Beregn levering igen.');}
    else fulfillmentAt = resolveFulfillmentTime(location, deliveryType, deliveryTime);
    await updateDoc(orderRef, { fulfillmentAt, deliveryTime: displayFulfillmentTime(managedQuote?.fulfillment.desiredDelivery.kind==='scheduled'?managedQuote.fulfillment.desiredDelivery.interval.earliest:fulfillmentAt) });
    if (discountCard) await assertDiscountCardCheckoutCurrent(getAdminDb(),{...discountCardInput,now:Date.now()},discountCard);
    stage = 'stripe_session';
    sessionRequestStarted = true;
    let session: Stripe.Checkout.Session;
    let sessionRequests = 0;
    const countSessionRequest = () => { sessionRequests++; };
    stripe.on('request', countSessionRequest);
    try {
      session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: orderId });
    } catch (error) {
      // A later 4xx can precede Stripe's idempotency layer (e.g. rate limiting)
      // after an earlier request succeeded but its response was lost.
      if (sessionRequests === 1 && isDefinitiveStripeRejection(error)) sessionRequestStarted = false;
      throw error;
    } finally {
      stripe.off('request', countSessionRequest);
    }

    stage = 'session_link';
    try {
      if (!session.url) throw new Error('Stripe did not return a hosted payment URL.');
      const patch = { 'psp.checkoutSessionId': session.id, updatedAt: serverTimestamp() };
      // The patch is idempotent. A transient write failure must not strand an
      // otherwise valid session or reserve another discount on retry.
      try { await updateDoc(orderRef, patch); }
      catch { await updateDoc(orderRef, patch); }
    } catch (error) {
      // A known but undeliverable session must be confirmed expired before a
      // fresh attempt is safe. Never assume expiration on a network exception.
      try {
        const expired = await stripe.checkout.sessions.expire(session.id);
        if (expired.status === 'expired' && expired.payment_status !== 'paid') sessionRequestStarted = false;
      } catch { /* Keep the reservation until signed Stripe reconciliation. */ }
      throw error;
    }
    if (customerInfo.analyticsConsent && customerInfo.analyticsSessionId) {
      try { await trackServerEvent('payment_session_created', {brandId, locationId, orderId, sessionId: customerInfo.analyticsSessionId, deviceType: customerInfo.analyticsDevice, cartValue: totalAmount}); } catch { /* Optional. */ }
    }
    return { success: true, url: session.url, orderId };

  } catch (e: any) {
    let retryable = !sessionRequestStarted;
    if (reservedOrderId && retryable) {
      try { await releaseDiscount(reservedOrderId, brandId); }
      catch { retryable = false; }
    }
    // Correlate stages without logging customer details, secrets or session URLs.
    console.error('checkout_failed', { stage, orderId: reservedOrderId, code: e?.code || e?.type || 'unknown', retryable });
    const identityMessage = checkoutCustomerIdentityMessage(e);
    const errorMessage = !retryable
      ? `Betalingsstatus kunne ikke bekræftes. Kontakt restauranten, før du prøver igen.${reservedOrderId ? ` Reference: ${reservedOrderId}.` : ''}`
      : identityMessage
      ? identityMessage
      : stage === 'newsletter_consent' ? 'Tilmeldingen kunne ikke gemmes. Prøv igen, eller fjern afkrydsningen for nyhedsbrev og fortsæt uden tilmelding.'
      : managedDeliveryAcceptance && stage === 'validation' ? 'Leveringstilbuddet eller kurven er ændret. Beregn levering igen, og kontrollér totalbeløbet.'
      : ['validation', 'reservation'].includes(stage) && e instanceof Error
        ? e.message
        : 'Betalingen kunne ikke åbnes. Prøv igen, eller kontakt restauranten.';
    return { success: false, error: errorMessage, retryable };
  }
}


export async function validateDiscountAction(
    code: string, 
    brandId: string, 
    locationId: string, 
    subtotal: number,
    deliveryType: 'delivery' | 'pickup',
    customerEmail?: string,
    cartProductIds?: string[],
    chargedSubtotal?: number
): Promise<{ success: boolean; message: string; discount?: Discount; }> {
    const codeUpper = code.toUpperCase();
    const discount = await getDiscountByCode(codeUpper, brandId);

    if (!discount) {
        return { success: false, message: 'Ugyldig rabatkode.' };
    }
    if(discount.gameProductId&&(!Array.isArray(cartProductIds)||!cartProductIds.includes(discount.gameProductId)))return {success:false,message:'Læg præmieproduktet i kurven, før du bruger koden.'};
    let customer: Customer | null = null;
    let customerId: string | undefined;
    if (customerEmail?.trim()) {
        let resolved;
        try {
            resolved = await resolveCheckoutCustomerRef({
                name: '',
                email: customerEmail,
                phone: '',
                subscribeToNewsletter: false,
            }, brandId);
        } catch (error) {
            return {
                success: false,
                message: checkoutCustomerIdentityMessage(error)
                    || 'Kundeoplysningerne kunne ikke kontrolleres. Prøv igen.',
            };
        }
        customerId = resolved.customerRef.id;
        customer = resolved.customerDoc.exists() ? resolved.customerDoc.data() as Customer : null;
    }

    if ((discount.firstTimeCustomerOnly || discount.assignedToCustomerId || discount.perCustomerLimit > 0) && !customerId) {
        return { success: false, message: 'Indtast din e-mailadresse, før du bruger rabatten.' };
    }

    const eligibilityError = validateDiscountEligibility(discount, {
        brandId,
        locationId,
        deliveryType,
        subtotal,
        chargedSubtotal: discount.gameProductId ? subtotal : chargedSubtotal,
        customerId,
        customer,
    });
    if (eligibilityError) return { success: false, message: eligibilityError };
    
    return { success: true, message: 'Rabatten er tilføjet!', discount };
}

// New helper functions for confirmation page
export async function getOrderByCheckoutSessionId(sessionId: string, receiptToken?: string): Promise<GuestReceipt | null> {
    return await readGuestReceipt({ sessionId, receiptToken });
}

export async function waitForOrderBySessionId(sessionId: string, receiptToken?: string): Promise<GuestReceipt | null> {
    // Retained compatibility entry, with the same proof and minimal projection.
    return readGuestReceipt({ sessionId, receiptToken });
}
