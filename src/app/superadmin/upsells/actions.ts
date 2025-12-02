

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { Upsell, Product, Category, CartItem, ProductForMenu, Brand, Location } from '@/types';
import { z, type ZodIssue } from 'zod';
import { redirect } from 'next/navigation';
import { getProductsByIds } from '../products/actions';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const triggerConditionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'product_in_cart',
    'category_in_cart',
    'cart_value_over',
    'combo_in_cart',
    'product_tag_in_cart',
  ]),
  referenceId: z.string().min(1, 'A reference value is required.'),
});

const upsellSchema = z.object({
    id: z.string().optional(),
    brandId: z.string().min(1, 'A brand must be selected.'),
    locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
    upsellName: z.string().min(2, 'Upsell name must be at least 2 characters.'),
    description: z.string().optional().nullable(),
    imageUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')).nullable(),

    offerType: z.enum(['product', 'category']),
    offerProductIds: z.array(z.string()).optional().default([]),
    offerCategoryIds: z.array(z.string()).optional().default([]),

    discountType: z.enum(['none', 'percentage', 'fixed_amount']),
    discountValue: z.coerce.number().positive('Discount value must be positive.').optional(),

    triggerConditions: z.array(triggerConditionSchema).min(1, 'At least one trigger condition is required.'),

    orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
    activeDays: z.array(z.string()).optional().default([]),
    activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    isActive: z.boolean().default(true),
    tags: z.array(z.enum(['Popular', 'Recommended', 'Campaign'])).optional().default([]),
  }).refine(data => {
      return !(data.offerType === 'product' && (!data.offerProductIds || data.offerProductIds.length === 0));
  }, {
      message: "At least one product must be selected for a product-based offer.",
      path: ["offerProductIds"],
  }).refine(data => {
      return !(data.offerType === 'category' && (!data.offerCategoryIds || data.offerCategoryIds.length === 0));
  }, {
      message: "At least one category must be selected for a category-based offer.",
      path: ["offerCategoryIds"],
  }).refine(data => {
      return !((data.discountType === 'percentage' || data.discountType === 'fixed_amount') && (data.discountValue === undefined || data.discountValue <= 0));
  }, {
      message: "A positive discount value is required for this discount type.",
      path: ["discountValue"],
  });


export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateUpsell(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const id = formData.get('id') as string | null;

    const safeParseFloat = (value: FormDataEntryValue | null): number | undefined => {
        if (value === null || typeof value !== 'string' || value.trim() === '') {
            return undefined;
        }
        const num = parseFloat(value.replace(',', '.'));
        return isNaN(num) ? undefined : num;
    };

    const rawData: Record<string, any> = {
      brandId: formData.get('brandId'),
      locationIds: formData.getAll('locationIds'),
      upsellName: formData.get('upsellName'),
      description: formData.get('description'),
      imageUrl: formData.get('imageUrl'),
      offerType: formData.get('offerType'),
      offerProductIds: formData.getAll('offerProductIds'),
      offerCategoryIds: formData.getAll('offerCategoryIds'),
      discountType: formData.get('discountType'),
      discountValue: safeParseFloat(formData.get('discountValue')),
      isActive: formData.has('isActive'),
      orderTypes: formData.getAll('orderTypes'),
      activeDays: formData.getAll('activeDays'),
      tags: formData.getAll('tags'),
    };
    
    if (id) rawData.id = id;

    const startDateString = formData.get('startDate') as string | null;
    if (startDateString) rawData.startDate = new Date(startDateString);
    
    const endDateString = formData.get('endDate') as string | null;
    if (endDateString) rawData.endDate = new Date(endDateString);
    
    const activeTimeSlotsJSON = formData.get('activeTimeSlots');
    if (typeof activeTimeSlotsJSON === 'string' && activeTimeSlotsJSON.trim() !== '') {
        rawData.activeTimeSlots = JSON.parse(activeTimeSlotsJSON);
    } else {
        rawData.activeTimeSlots = [];
    }

    const triggerConditionsJSON = formData.get('triggerConditions');
    if (typeof triggerConditionsJSON === 'string' && triggerConditionsJSON.trim() !== '') {
        rawData.triggerConditions = JSON.parse(triggerConditionsJSON);
    } else {
        rawData.triggerConditions = [];
    }

    const validatedFields = upsellSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Check your inputs.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const { id: _ignoredId, startDate, endDate, description, imageUrl, ...rest } = validatedFields.data;
    
    const normalised = {
        ...rest,
        description: description ?? undefined,
        imageUrl: imageUrl ?? undefined,
    };

    const db = getAdminDb();
    const existing = id ? await getUpsellById(id) : null;
    
    const dataToSave: Omit<Upsell, 'id' | 'createdAt' | 'updatedAt' | 'views' | 'conversions'> & { createdAt?: admin.firestore.Timestamp; updatedAt: admin.firestore.Timestamp; startDate?: admin.firestore.Timestamp | null; endDate?: admin.firestore.Timestamp | null; views: number; conversions: number; } = {
      ...normalised,
      updatedAt: admin.firestore.Timestamp.now(),
      views: existing?.views ?? 0,
      conversions: existing?.conversions ?? 0,
    };
    
    if (startDate) dataToSave.startDate = admin.firestore.Timestamp.fromDate(startDate);
    if (endDate) dataToSave.endDate = admin.firestore.Timestamp.fromDate(endDate);

    const upsellRef = id ? db.collection('upsells').doc(id) : db.collection('upsells').doc();
    const upsellIdToSave = upsellRef.id;

    if (!id) {
      dataToSave.createdAt = admin.firestore.Timestamp.now();
    }
    
    await upsellRef.set({ ...dataToSave, id: upsellIdToSave }, { merge: true });
    
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error in createOrUpdateUpsell:', e);
    return { message: `Failed to save upsell: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/upsells');
  redirect('/superadmin/upsells');
}

export async function deleteUpsell(upsellId: string) {
    try {
        const db = getAdminDb();
        await db.collection("upsells").doc(upsellId).delete();
        revalidatePath("/superadmin/upsells");
        return { message: "Upsell deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete upsell: ${errorMessage}`, error: true };
    }
}

export async function getUpsells(): Promise<Upsell[]> {
  const db = getAdminDb();
  const q = db.collection('upsells').orderBy('upsellName');
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => {
    const data = doc.data() as Omit<Upsell, 'id'>;
    return {
      ...data,
      id: doc.id,
    } as Upsell;
  });
}

export async function getUpsellById(upsellId: string): Promise<Upsell | null> {
    const db = getAdminDb();
    const docRef = db.collection('upsells').doc(upsellId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data() as Omit<Upsell, 'id'>;
        return {
            ...data,
            id: docSnap.id,
        } as Upsell;
    }
    return null;
}

// Logic to find a matching upsell for the current cart state
type GetActiveUpsellParams = {
  brandId: string;
  locationId: string;
  cartItems: { id: string; categoryId?: string }[];
  cartTotal: number;
};
export async function getActiveUpsellForCart({
  brandId,
  locationId,
  cartItems,
  cartTotal,
}: GetActiveUpsellParams): Promise<{
  upsell: Upsell;
  products: ProductForMenu[];
} | null> {
  const now = new Date();
  const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
  const db = getAdminDb();

  // 1. Fetch all potentially active upsells for the brand and location
  const q = db.collection('upsells')
    .where('brandId', '==', brandId)
    .where('locationIds', 'array-contains', locationId)
    .where('isActive', '==', true);
  
  const snapshot = await q.get();
  
  const allUpsells = snapshot.docs.map(doc => {
    const data = doc.data() as Omit<Upsell, 'id'>;
    return {
      ...data,
      id: doc.id,
    } as Upsell;
  });
  
  // 2. Filter by date, day, and time in code
  const activeNowUpsells = allUpsells.filter(upsell => {
      const startDate = upsell.startDate ? (upsell.startDate as admin.firestore.Timestamp).toDate() : null;
      const endDate = upsell.endDate ? (upsell.endDate as admin.firestore.Timestamp).toDate() : null;
      if (startDate && now < startDate) return false;
      if (endDate && now > endDate) return false;

      if (upsell.activeDays.length > 0 && !upsell.activeDays.includes(currentDay)) return false;

      if (upsell.activeTimeSlots.length > 0) {
          const currentTime = now.toTimeString().slice(0,5);
          const inActiveTime = upsell.activeTimeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end);
          if(!inActiveTime) return false;
      }
      return true;
  });
  
  if (activeNowUpsells.length === 0) return null;

  const cartProductIds = cartItems.map(item => item.id);
  const cartCategoryIds = new Set(cartItems.map(item => item.categoryId).filter(Boolean));
  
  // 3. Check trigger conditions for each active upsell
  for (const upsell of activeNowUpsells) {
      let isTriggered = false;
      for (const condition of upsell.triggerConditions) {
          if (condition.type === 'cart_value_over') {
              if (cartTotal > parseFloat(condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'product_in_cart') {
              if (cartProductIds.includes(condition.referenceId)) isTriggered = true;
          } else if (condition.type === 'category_in_cart') {
               if (cartCategoryIds.has(condition.referenceId)) isTriggered = true;
          }
          if (isTriggered) break; // If any condition is met, we don't need to check others for this upsell
      }

      if (isTriggered) {
           // 4. If triggered, fetch the offered products
          let offeredProductIds: string[] = [];
          if (upsell.offerType === 'product') {
              offeredProductIds = upsell.offerProductIds;
          } else { // offerType is 'category'
              const catProductsQuery = db.collection('products').where('categoryId', 'in', upsell.offerCategoryIds);
              const catProductsSnapshot = await catProductsQuery.get();
              offeredProductIds = catProductsSnapshot.docs.map(doc => doc.id);
          }
          
          // 5. Suppression Logic: Filter out products already in the cart
          const currentCartProductIds = new Set(cartItems.map(item => item.id));
          const finalProductIds = offeredProductIds.filter(id => !currentCartProductIds.has(id));

          if (finalProductIds.length > 0) {
              // Fetch full product details
              const products = await getProductsByIds(finalProductIds, brandId);
              
              if (products.length > 0) {
                  // Increment the views count
                  try {
                      const upsellRef = db.collection('upsells').doc(upsell.id);
                      await db.runTransaction(async (transaction) => {
                          const sfDoc = await transaction.get(upsellRef);
                          if (!sfDoc.exists) { throw "Document does not exist!"; }
                          const newViews = (sfDoc.data()!.views || 0) + 1;
                          transaction.update(upsellRef, { views: newViews });
                      });
                  } catch(e) {
                      console.error("Failed to increment upsell views:", e);
                  }
                  
                  return { upsell: upsell as Upsell, products: products as ProductForMenu[] }; // Return the first valid upsell found
              }
          }
      }
  }

  return null; // No valid upsell found
}


export async function incrementUpsellConversion(upsellId: string): Promise<{ success: boolean }> {
    try {
        const db = getAdminDb();
        const upsellRef = db.collection('upsells').doc(upsellId);
        await db.runTransaction(async (transaction) => {
            const sfDoc = await transaction.get(upsellRef);
            if (!sfDoc.exists) { throw "Document does not exist!"; }
            const newConversions = (sfDoc.data()!.conversions || 0) + 1;
            transaction.update(upsellRef, { conversions: newConversions });
        });
        return { success: true };
    } catch(e) {
        console.error("Failed to increment upsell conversions:", e);
        return { success: false };
    }
}

export async function getProductsForBrand(brandId: string): Promise<ProductForMenu[]> {
  if (!brandId) return [];
  const db = getAdminDb();
  const q = db.collection('products').where('brandId', '==', brandId);
  const querySnapshot = await q.get();
  const products = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})) as Product[];
  // Sort in memory to avoid needing a composite index for sorting
  return products.sort((a,b) => (a.sortOrder || 999) - (b.sortOrder || 999));
}

export async function getCategoriesForBrand(brandId: string): Promise<Category[]> {
    if (!brandId) return [];
    const db = getAdminDb();
    
    const locationsQuery = db.collection('locations').where('brandId', '==', brandId);
    const locationsSnapshot = await locationsQuery.get();
    if (locationsSnapshot.empty) return [];
    const locationIds = locationsSnapshot.docs.map(doc => doc.id);

    const categoryPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
    for (let i = 0; i < locationIds.length; i += 30) {
        const chunk = locationIds.slice(i, i + 30);
        const categoriesQuery = db.collection('categories').where('locationIds', 'array-contains-any', chunk);
        categoryPromises.push(categoriesQuery.get());
    }
    
    const categorySnapshots = await Promise.all(categoryPromises);
    const categories: Category[] = [];
    const categoryIds = new Set<string>();

    categorySnapshots.forEach(snapshot => {
        snapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
            if (!categoryIds.has(doc.id)) {
                categories.push({ id: doc.id, ...doc.data() } as Category);
                categoryIds.add(doc.id);
            }
        });
    });

    return categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

```
  </change>
  <change>
    <file>src/types.ts</file>
    <content><![CDATA[

//
// ========================================
// Orderfly - Data Models & Type Definitions
// ========================================
//
// This file defines the core TypeScript types for all Firestore collections.
//
// ----------------------------------------
// SECTION 4.1: Datamodel & Database Struktur (Firestore)
// ----------------------------------------
//

import { z } from 'zod';
import type { FirebaseFirestore } from 'firebase-admin';
export type { GeneralSettings } from './settings';

/**
 * @description Contains master data for each brand/company on the platform.
 * @collection brands
 */
export type Brand = {
  id: string;
  name: string;
  slug: string;
  companyName: string;
  ownerId: string;
  subscriptionPlanId?: string;
  status: 'active' | 'suspended' | 'pending' | 'trialing';
  street: string;
  zipCode: string; // "PO Box" is often used for Zip/Postal code
  city: string;
  country: string; // ISO 3166-1 alpha-2 code
  currency: string; // ISO 4217 currency code
  companyRegNo: string;
  foodCategories: string[]; // Storing as an array of food category IDs
  locationsCount: number;
  logoUrl?: string;
  supportEmail?: string;
  website?: string;
  termsUrl?: string;
  privacyUrl?: string;
  cookiesUrl?: string;
  offersHeading?: string;
  combosHeading?: string;
  bagFee?: number;
  adminFee?: number;
  adminFeeType?: 'fixed' | 'percentage';
  vatPercentage?: number;
  appearances?: BrandAppearances;
  // Analytics overrides
  ga4MeasurementId?: string;
  gtmContainerId?: string;
};

/**
 * @description Represents the visual styling for a brand.
 */
export type BrandAppearances = {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    border: string;
    buttonText: string;
  };
  typography: {
    fontFamily: string;
  };
};

/**
 * @description Stores user profiles, synced with Firebase Authentication.
 * @collection users
 */
export type User = {
  id: string; // Corresponds to Firebase Auth UID
  name: string;
  email: string;
  roleIds: string[];
};

/**
 * @description Defines groups of permissions that can be assigned to users.
 * @collection roles
 */
export type Role = {
  id: string;
  name: string;
  description?: string;
  permissions: string[]; // e.g., ['orders:view', 'products:edit']
};

/**
 * @description Customer information provided during checkout.
 */
export interface CustomerInfo {
    name: string;
    email: string;
    phone: string;
    street?: string;
    zipCode?: string;
    city?: string;
    subscribeToNewsletter: boolean;
}

/**
 * @description End-customer who places orders.
 * @collection customers
 */
export type Customer = {
    id: string;
    brandId: string;
    fullName: string;
    email: string;
    phone: string;
    street?: string;
    zipCode?: string;
    city?: string;
    country?: string;
    marketingConsent?: boolean;
    tags?: string[];
    notes?: string;
    status: 'active' | 'inactive';
    createdAt: Date;
    // Aggregated fields, updated via triggers or batch jobs
    totalOrders: number;
    totalSpend: number;
    lastOrderDate?: Date;
    locationIds: string[];
    loyaltyScore: number;
    loyaltyClassification: string;
    cookie_consent?: {
        marketing: boolean;
        statistics: boolean;
        functional: boolean;
        timestamp: Date;
        consent_version: string;
        linked_anon_id?: string;
        origin_brand?: string;
    };
};

/**
 * @description Tracks a brand's subscription status, synced from Stripe.
 * @collection subscriptions
 */
export type Subscription = {
  id: string;
  brandId: string;
  planId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  paymentProviderCustomerId: string;
  paymentProviderSubscriptionId: string;
};

/**
 * @description Defines the different subscription packages available.
 * @collection subscription_plans
 */
export type SubscriptionPlan = {
  id:string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  serviceFee: number;
  isActive: boolean;
  isMostPopular: boolean;
  featureIds?: string[];
};

/**
* @description Represents an invoice for a brand's subscription.
* @collection brands/{brandId}/invoices
*/
export type Invoice = {
    id: string;
    brandId: string;
    date: string;
    status: 'paid' | 'open' | 'void';
    amount: number;
};


/**
 * @description Contains all information about a physical location/restaurant.
 * @collection locations
 */
export type Location = {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  address: string;
  street: string;
  zipCode: string;
  city: string;
  country: string;
  isActive: boolean;
  openingHours: Record<string, { isOpen: boolean; open: string; close: string }>;
  deliveryFee: number;
  minOrder: number;
  deliveryTypes: ('delivery' | 'pickup')[];
  imageUrl?: string;
  smileyUrl?: string;
  allowPreOrder?: boolean;
  prep_time: number;
  delivery_time: number;
  travlhed_factor: 'normal' | 'medium' | 'høj';
  manual_override?: number;
  pickupSaveTag?: string;

  // Calculated fields, added in actions
  supportsDelivery?: boolean;
  supportsPickup?: boolean;
};

export interface TimeSlotResponse {
  tidsinterval: number;
  pickup_times: string[];
  delivery_times: string[];
  asap_pickup: string;
  asap_delivery: string;
  nextAvailableDate?: string;
}

/**
 * @description The central collection for all menu items.
 * @collection products
 */
export type Product = {
  id: string;
  brandId: string;
  locationIds: string[];
  categoryId: string;
  productName: string;
  description?: string;
  price: number;
  priceDelivery?: number;
  imageUrl?: string;
  isActive: boolean;
  allergenIds?: string[];
  toppingGroupIds?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  isPopular?: boolean;
  sortOrder?: number;
};

/**
 * @description Lightweight product type for menu display to reduce payload size.
 */
export type ProductForMenu = Pick<Product, 
    'id' | 'productName' | 'description' | 'price' | 'priceDelivery' | 
    'imageUrl' | 'isFeatured' | 'isNew' | 'isPopular' | 'allergenIds' | 
    'toppingGroupIds' | 'categoryId' | 'brandId' | 'sortOrder'
>;


/**
 * @description Location-specific product categories.
 * @collection categories
 */
export type Category = {
  id: string;
  brandId: string; // The primary brand this category is associated with
  locationIds: string[];
  categoryName: string;
  description?: string;
  isActive: boolean;
  sortOrder?: number;
  icon?: string;
};

/**
 * @description A global list of allergens that can be assigned to products.
 * @collection allergens
 */
export type Allergen = {
  id: string;
  allergenName: string;
  icon?: string;
  isActive: boolean;
};

/**
 * @description A group of toppings that can be added to a product.
 * @collection topping_groups
 */
export type ToppingGroup = {
  id: string;
  groupName: string;
  locationIds: string[];
  minSelection: number;
  maxSelection: number;
};

/**
 * @description A single topping option within a group.
 * @collection toppings
 */
export type Topping = {
  id: string;
  toppingName: string;
  price: number;
  isActive: boolean;
  isDefault?: boolean;
  groupId: string;
  locationIds: string[];
  sortOrder?: number;
};

/**
 * @description A selected topping for a specific item in the cart.
 */
export type CartItemTopping = {
    name: string;
    price: number;
};

/**
 * @description A summarized version of an order for list views.
 * @collection orders
 */
export type OrderStatus = 'Received' | 'In Progress' | 'Ready' | 'Completed' | 'Delivered' | 'Canceled' | 'Error';

export type OrderSummary = {
    id: string;
    createdAt: Date;
    customerName: string;
    customerContact: string;
    brandId: string;
    brandName: string;
    locationId: string;
    locationName: string;
    deliveryType: 'Pickup' | 'Delivery';
    deliveryTime?: string;
    status: OrderStatus;
    totalAmount: number;
    paymentStatus: 'Paid' | 'Pending' | 'Failed';
    paymentMethod: 'Stripe' | 'Cash' | 'Other';
    paymentDetails: PaymentDetails;
};

export type PaymentDetails = {
    subtotal: number;
    taxes: number;
    deliveryFee: number;
    bagFee?: number;
    adminFee?: number;
    vatAmount?: number;
    discountTotal: number;
    itemDiscountTotal?: number;
    cartDiscountTotal?: number;
    cartDiscountName?: string;
    upsellAmount?: number;
    tips: number;
    paymentRefId: string;
}

/**
 * @description A detailed view of a single order.
 */
export type OrderDetail = OrderSummary & {
  brandLogoUrl?: string | null;
  productItems: MinimalCartItem[];
  customerDetails: {
    id: string;
    address: string;
    deliveryInstructions?: string;
  };
  deliveryTime?: string;
  paidAt?: Date;
  psp?: {
      provider: 'stripe';
      checkoutSessionId?: string;
      paymentIntentId?: string;
      descriptorPrefix?: string;
      descriptorSuffix?: string;
  }
};


/**
 * @description Staging collection for raw order data before processing.
 * @collection raw_orders
 */
export type RawOrder = {
  id: string;
  payload: Record<string, any>; // Full, unstructured payload from checkout/webhook
  processingStatus: 'pending' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
};

/**
 * @description Defines all discount codes and automatic offers.
 * @collection discounts
 */
export type Discount = {
  id: string;
  brandId: string;
  locationIds: string[];
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  minOrderValue?: number;
  isActive: boolean;
  orderTypes: ('pickup' | 'delivery')[];
  activeDays: string[];
  activeTimeSlots: { start: string, end: string }[];
  startDate?: Date;
  endDate?: Date;
  usageLimit: number;
  usedCount: number;
  perCustomerLimit: number;
  assignedToCustomerId?: string;
  firstTimeCustomerOnly: boolean;
  allowStacking: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * @description Defines an automatic standard discount.
 * @collection standard_discounts
 */
export type StandardDiscount = {
  id: string;
  brandId: string;
  locationIds: string[];
  discountName: string;
  discountType: 'product' | 'category' | 'cart' | 'free_delivery';
  referenceIds: string[]; // Product or Category IDs
  discountMethod: 'percentage' | 'fixed_amount';
  discountValue?: number;
  minOrderValue?: number;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
  orderTypes: ('pickup' | 'delivery')[];
  activeDays: string[];
  activeTimeSlots: { start: string, end: string }[];
  timeSlotValidationType: 'orderTime' | 'pickupTime';
  allowStacking: boolean;
  // New marketing fields for frontend display
  discountHeading?: string;
  discountDescription?: string;
  discountImageUrl?: string | null;
  assignToOfferCategory?: boolean;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * @description Defines a group of products within a combo menu.
 */
export type ProductGroup = {
  id: string;
  groupName: string;
  productIds: string[];
  minSelection: number;
  maxSelection: number;
};

/**
 * @description Defines the selected products for a combo item in the cart.
 */
export type ComboSelection = {
    groupName: string;
    products: {
        id: string;
        name: string;
    }[];
}

/**
 * @description Defines a combo menu or meal deal.
 * @collection comboMenus
 */
export type ComboMenu = {
  id: string;
  brandId: string;
  locationIds: string[];
  comboName: string;
  description?: string;
  pickupPrice?: number;
  deliveryPrice?: number;
  calculatedNormalPricePickup: number;
  calculatedNormalPriceDelivery: number;
  priceDifferencePickup?: number;
  priceDifferenceDelivery?: number;
  
  imageUrl?: string | null;
  activeDays: string[];
  activeTimeSlots: { start: string, end: string }[];
  orderTypes: ('pickup' | 'delivery')[];
  tags: ('Popular' | 'Recommended' | 'Campaign')[];
  productGroups: ProductGroup[];

  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * @description A fully detailed item in the shopping cart.
 */
export interface CartItem {
  id: string; // Original product ID
  cartItemId: string; // Unique ID for this specific item instance in the cart
  itemType: 'product' | 'combo';
  productName: string;
  description?: string;
  imageUrl?: string;
  basePrice: number; // The product's original price, BEFORE any discounts.
  price: number; // The product's price AFTER any standard discounts are applied.
  quantity: number;
  toppings: CartItemTopping[]; // Only for itemType 'product'
  itemTotal: number; // The final price for one item (price + toppings)
  categoryId?: string; // Crucial for upsell logic
  brandId: string;
  comboSelections?: ComboSelection[]; // Only for itemType 'combo'
}

/**
 * @description A minimal representation of a cart item sent to the server.
 */
export type MinimalCartItem = {
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    toppings?: string[];
}


export type TriggerCondition = {
  id: string; // Unique ID for the condition in the array
  type: 'product_in_cart' | 'category_in_cart' | 'cart_value_over' | 'combo_in_cart' | 'product_tag_in_cart';
  referenceId: string; // Product ID, Category ID, or cart value
};

/**
 * @description Defines an upsell or cross-sell promotion.
 * @collection upsells
 */
export type Upsell = {
  id: string;
  brandId: string;
  locationIds: string[];
  upsellName: string;
  description?: string | null;
  imageUrl?: string | null;

  // Offer Details
  offerType: 'product' | 'category';
  offerProductIds: string[];
  offerCategoryIds: string[];

  // Discount Details
  discountType: 'none' | 'percentage' | 'fixed_amount';
  discountValue?: number;
  tags: ('Popular' | 'Recommended' | 'Campaign')[];

  // Trigger Logic
  triggerConditions: TriggerCondition[];

  // Availability
  orderTypes: ('pickup' | 'delivery')[];
  activeDays: string[];
  activeTimeSlots: { start: string; end: string }[];
  startDate?: FirebaseFirestore.Timestamp | null;
  endDate?: FirebaseFirestore.Timestamp | null;
  isActive: boolean;

  // Tracking
  views: number;
  conversions: number;
  
  // Timestamps
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};


/**
 * @description Platform-wide Google Analytics settings.
 * @collection platform_settings/analytics
 */
export type AnalyticsSettings = {
  ga4TrackingId: string;
  gtmContainerId: string;
};

/**
 * @description Platform-wide payment gateway (Stripe) settings.
 * @collection platform_settings/payment_gateway
 */
export type PaymentGatewaySettings = {
  activeMode: 'test' | 'live';
  test: {
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string;
  };
  live: {
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string;
  };
};

/**
 * @description Platform-wide language settings.
 */
export type LanguageSetting = {
  code: string; // e.g., 'en', 'da'
  name: string; // e.g., 'English', 'Dansk'
};

export type LanguageSettings = {
  supportedLanguages: LanguageSetting[];
};

/**
 * @description Platform-wide branding settings.
 * @collection platform_settings/branding
 */
export type PlatformBrandingSettings = {
  platformLogoUrl?: string | null;
  platformFaviconUrl?: string | null;
  platformHeading: string;
};


/**
 * @description Platform-wide loyalty score settings.
 * @collection platform_settings/loyalty
 */
export type LoyaltySettings = {
  weights: {
    totalOrders: number;
    averageOrderValue: number;
    recency: number;
    frequency: number;
    deliveryMethodBonus: number;
  };
  thresholds: {
    totalOrders: { points: number; value: number }[];
    averageOrderValue: { points: number; value: number }[];
    recency: { points: number; value: number }[];
    frequency: { points: number; value: number }[];
  };
  deliveryMethodBonus: number;
  classifications: {
    loyal: { min: number; max: number };
    occasional: { min: number; max: number };
    atRisk: { min: number; max: number };
  };
};

/**
 * @description A global list of food categories that can be assigned to brands for classification.
 * @collection food_categories
 */
export type FoodCategory = {
  id: string;
  name: string;
  description?: string;
};

export type Country = {
    code: string;
    name: string;
    currency: string;
}

/**
 * @description Represents a record of a code change review.
 */
export type CodeReview = {
  id: string;
  title: string;
  description: string;
  status: 'approved' | 'rejected' | 'pending';
  reviewedBy: string;
  reviewedAt: Date;
  featureRef: string; // e.g., 'brand-appearances'
  relatedPath: string; // e.g., '/src/components/superadmin/brand-appearances-form.tsx'
  version: string;
  files: {
    name: string;
    diff: string;
  }[];
};

/**
 * @description Stores customer feedback tied to an order.
 * @collection feedback
 */
export type Feedback = {
  id: string;
  orderId: string;
  customerId: string;
  locationId: string;
  brandId: string;
  receivedAt: Date;
  rating: number; // 1-5 stars
  npsScore?: number; // 0-10
  comment?: string;
  tags?: string[];
  questionVersionId: string;
  language: string; // "da", "en", etc.
  showPublicly: boolean;
  maskCustomerName: boolean;
  answeredVia?: 'email' | 'webshop' | 'app';
  internalNote?: string;
  autoResponseSent: boolean;
  responses: any;
};

/**
 * @description A single option for a multiple choice question.
 */
export type FeedbackQuestionOption = {
  id: string;
  label: string;
};

/**
 * @description Represents a single question within a feedback form version.
 */
export type FeedbackQuestion = {
  questionId: string;
  label: string;
  type: 'stars' | 'nps' | 'text' | 'tags' | 'multiple_options';
  isRequired: boolean;
  options?: FeedbackQuestionOption[]; // For 'multiple_options' and 'tags'
  minSelection?: number; // For 'multiple_options'
  maxSelection?: number; // For 'multiple_options'
};

/**
 * @description Defines a versioned set of questions for feedback forms.
 * @collection feedbackQuestionsVersion
 */
export type FeedbackQuestionsVersion = {
  id: string;
  versionLabel: string; // e.g., "v1.0", "2025Q3"
  isActive: boolean;
  language: string;
  orderTypes: ('pickup' | 'delivery')[];
  questions: FeedbackQuestion[];
};

/**
 * @description Stores cookie consent from anonymous users.
 * @collection anonymous_cookie_consents
 */
export type AnonymousCookieConsent = {
  id: string; // primary key
  anon_user_id: string; // UUID
  marketing: boolean;
  statistics: boolean;
  functional: boolean;
  necessary: true;
  consent_version: string;
  first_seen: Date;
  last_seen: Date;
  origin_brand: string;
  brand_id: string;
  shared_scope: 'orderfly';
  linked_to_customer: boolean;
};

/**
 * @description Stores dynamic texts for the cookie consent UI.
 * @collection cookie_texts
 */
export type CookieTexts = {
  id: string;
  consent_version: string;
  language: string;
  brand_id?: string;
  shared_scope: 'orderfly';
  banner_title: string;
  banner_description: string;
  accept_all_button: string;
  customize_button: string;
  modal_title: string;
  modal_description: string;
  save_preferences_button: string;
  modal_accept_all_button: string;
  categories: {
    necessary: { title: string; description: string };
    functional: { title: string; description: string };
    analytics: { title: string; description: string };
    statistics: { title: string; description: string };
    performance: { title: string; description: string };
    marketing: { title: string; description: string };
  };
  last_updated: Date;
};

// Analytics Event Types
export type AnalyticsEventName = 
  | 'view_menu' 
  | 'view_product' 
  | 'add_to_cart' 
  | 'start_checkout' 
  | 'customer_info_started' 
  | 'delivery_method_selected' 
  | 'click_purchase'
  | 'payment_session_created' 
  | 'payment_succeeded' 
  | 'order_confirmed_view' 
  | 'upsell_offer_shown' 
  | 'upsell_accepted' 
  | 'upsell_rejected';

export type AnalyticsEvent = {
  id: string;
  ts: FirebaseFirestore.Timestamp;
  name: AnalyticsEventName;
  brandId: string;
  brandSlug: string;
  locationId: string;
  locationSlug: string;
  sessionId: string;
  deviceType?: "desktop" | "mobile";
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  landingPage?: string;
  cartValue?: number;
  deliveryFee?: number;
  discountTotal?: number;
  props?: Record<string, any>;
};

export type FunnelCounting = 'events' | 'unique';

export type FunnelFilters = {
  dateFrom: string;
  dateTo: string;
  brandId?: string;
  locationId?: string;
  device?: 'desktop' | 'mobile';
  utmSource?: string;
  counting?: FunnelCounting; // NEW
};

/**
 * @description Aggregated daily analytics data.
 * @collection analytics_daily
 */
export type AnalyticsDaily = {
  id: string; // Format: YYYY-MM-DD_brandId_locationId
  date: string; // YYYY-MM-DD
  brandId: string;
  locationId: string;
  
  // Counts
  sessions: number;
  unique_sessions: number; // Add this field
  view_menu: number;
  view_product: number;
  add_to_cart: number;
  start_checkout: number;
  click_purchase: number;
  payment_succeeded: number;
  payment_session_created: number;
  upsell_offer_shown: number;
  upsell_accepted: number;
  upsell_rejected: number;

  // Sums
  revenue_paid: number;
  delivery_fees_total: number;
  discounts_total: number;
  items_qty_total: number;
  
  // Rates
  cr_view_product_from_menu: number;
  cr_add_to_cart_from_view_product: number;
  cr_start_checkout_from_add_to_cart: number;
  cr_purchase_from_click_purchase: number;
  cr_purchase_from_start_checkout: number;
  cr_purchase_from_sessions: number; // Total CR
  cr_upsell: number;

  // KPIs
  aov: number;

  // Meta
  agg_version: number;
  updated_at: FirebaseFirestore.Timestamp;
};

export type FunnelOutput = {
  totals: {
    sessions: number;
    view_menu: number;
    view_product: number;
    add_to_cart: number;
    start_checkout: number;
    click_purchase: number;
    payment_succeeded: number;
    payment_session_created: number;
    upsell_offer_shown: number;
    upsell_accepted: number;
    upsell_rejected: number;
    revenue_paid: number;
    delivery_fees_total: number;
    discounts_total: number;
  };
  daily: AnalyticsDaily[];
  byLocation: Array<{
    locationId: string;
    locationName: string;
    sessions: number;
    purchases: number;
    convSessionsToPurchase: number;
    aov?: number;
    revenue?: number;
  }>;
};


// Mock Types - Used for demo/prototyping before full backend integration
export type MockProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  deliveryPrice: number;
  imageUrl: string;
  categoryId: string;
  allergens: string[];
  defaultToppings: string[];
  removableIngredients: string[];
  priority: number;
  status: 'Active' | 'Draft';
};


// AI Flow Types
export const MenuImportInputSchema = z.object({
  menuImageUri: z
    .string()
    .describe(
      "A photo of a menu, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type MenuImportInput = z.infer<typeof MenuImportInputSchema>;

const MenuItemSchema = z.object({
  name: z.string().describe('The name of the menu item.'),
  description: z.string().describe('A short description of the menu item.'),
  price: z.number().describe('The price of the menu item.'),
});
export const MenuImportOutputSchema = z.array(MenuItemSchema).describe('An array of menu items extracted from the image.');
export type MenuImportOutput = z.infer<typeof MenuImportOutputSchema>;


export const AIProjectQualificationInputSchema = z.object({
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
});
export type AIProjectQualificationInput = z.infer<typeof AIProjectQualificationInputSchema>;

export const AIProjectQualificationOutputSchema = z.object({
  qualified: z.boolean().describe("Whether the user's project is a good fit for Digifly."),
  shouldBookMeeting: z.boolean().describe("Whether the user should be prompted to book a meeting."),
  nextQuestion: z.string().describe("The next question to ask the user to continue the qualification process."),
  collectedInfo: z.object({
    name: z.string().optional().describe("The user's full name."),
    email: z.string().optional().describe("The user's email address."),
    phone: z.string().optional().describe("The user's phone number."),
    projectIdea: z.string().optional().describe("A summary of the user's project idea."),
  }).describe("The information collected from the user so far."),
});
export type AIProjectQualificationOutput = z.infer<typeof AIProjectQualificationOutputSchema>;

    
