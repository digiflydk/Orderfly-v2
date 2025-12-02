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