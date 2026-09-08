'use client';

import { resolveFulfillmentTime, displayFulfillmentTime } from '@/lib/fulfillment-time';
import { checkoutItems } from '@/lib/checkout-items';
import { requestHostedCheckout } from '@/lib/checkout-request';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import { handledUpsells, markUpsellHandled } from '@/lib/handled-upsells';
import * as React from 'react';
import { useCart } from "@/context/cart-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import Link from "next/link";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getNewsletterSignupDiscountAction, validateDiscountAction } from "@/app/checkout/actions";
import type { NewsletterDiscountOffer } from "@/app/checkout/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Tag, Truck, Store, Clock, ShoppingCart, AlertTriangle, ArrowLeft } from "lucide-react";
import { Badge } from "../ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useParams } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import type {
  Brand,
  PaymentDetails,
  TimeSlotResponse,
  MinimalCartItem,
  Location,
  Upsell,
  ProductForMenu,
  CustomerInfo
} from '@/types';
import { TimeSlotDialog } from "./timeslot-dialog";
import { Alert, AlertTitle, AlertDescription } from "../ui/alert";
import Cookies from "js-cookie";
import { useAnalytics } from '@/context/analytics-context';
import { cn } from '@/lib/utils';
import { getActiveUpsellForCart } from '@/app/superadmin/upsells/actions';
import { UpsellDialog } from './upsell-dialog';
import { isLockedItem } from '@/lib/cart-utils';
import { calculateTimeSlots } from '@/app/superadmin/locations/client-actions';
import { safeImage } from '@/lib/images';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';

const checkoutSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(5, "Phone number is required"),
  street: z.string().optional(),
  zipCode: z.string().optional(),
  city: z.string().optional(),
  subscribeToNewsletter: z.boolean().default(false),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "You must accept the terms and conditions."
  }),
});

// Formular-type (subscribeToNewsletter er valgfrit)
interface CheckoutFormValues {
  name: string;
  email: string;
  phone: string;
  street?: string;
  zipCode?: string;
  city?: string;
  subscribeToNewsletter?: boolean;
  acceptTerms: boolean;
}

interface CheckoutClientProps {
  brand: Brand;
  location: Location;
}

function BagFeeRow() {
  const { brand, includeBagFee, toggleBagFee } = useCart();
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  if (!brand?.bagFee || brand.bagFee <= 0) {
    return null;
  }

  const handleRemove = () => {
    setIsAlertOpen(true);
  };

  const handleConfirmRemove = () => {
    toggleBagFee(false);
    setIsAlertOpen(false);
  };

  if (!includeBagFee) {
    return null;
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
          <span>Bag</span>
        </div>
        <span>kr.{brand.bagFee.toFixed(2)}</span>
      </div>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the bag?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>Yes, remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrderSummaryContent() {
  const {
    cartItems,
    subtotal,
    checkoutTotal,
    itemDiscount,
    cartDiscount,
    voucherDiscount,
    freeDeliveryDiscountApplied,
    deliveryFee,
    brand,
    adminFee,
    vatAmount,
    deliveryType
  } = useCart();

  return (
    <div className="space-y-4">
      {cartItems.map(item => {
        const toppingsPrice =
          item.toppings.reduce((sum, topping) => sum + topping.price, 0) * item.quantity;
        const originalLinePrice = item.basePrice * item.quantity + toppingsPrice;
        const discountedLinePrice = item.price * item.quantity + toppingsPrice;
        const hasDiscount = originalLinePrice > discountedLinePrice;

        return (
          <div key={item.cartItemId} className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <Image
                  src={safeImage(item.imageUrl)}
                  alt={item.productName}
                  fill
                  className="rounded-md object-cover"
                  data-ai-hint="delicious food"
                />
              </div>
              <div>
                <div className="font-medium">
                  {item.productName}{" "}
                  {item.itemType === 'combo' && <Badge>Combo</Badge>}
                </div>
                <p className="text-sm">
                  {hasDiscount ? (
                    <>
                      <span className="font-bold text-foreground">
                        kr.{discountedLinePrice.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground line-through ml-2">
                        kr.{originalLinePrice.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      kr.{discountedLinePrice.toFixed(2)}
                    </span>
                  )}
                </p>
                {item.toppings.length > 0 && (
                  <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                    {item.toppings.map(topping => (
                      <li key={topping.name}>
                        {topping.name} (+kr.{topping.price.toFixed(2)})
                      </li>
                    ))}
                  </ul>
                )}
                {item.comboSelections && item.comboSelections.length > 0 && (
                  <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                    {item.comboSelections.flatMap(sel => sel.products).map(p => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">
                kr. {(item.price * item.quantity + toppingsPrice).toFixed(2)}
              </p>
            </div>
          </div>
        );
      })}
      <Separator />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>kr.{subtotal.toFixed(2)}</span>
        </div>

        {itemDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Item Discounts</span>
            <span>- kr.{itemDiscount.toFixed(2)}</span>
          </div>
        )}
        {cartDiscount && (
          <div className="flex justify-between text-green-600">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>{cartDiscount.name}</span>
            </div>
            <span>- kr.{cartDiscount.amount.toFixed(2)}</span>
          </div>
        )}
        {voucherDiscount && (
          <div className="flex justify-between text-green-600">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>Code: {voucherDiscount.name}</span>
            </div>
            <span>- kr.{voucherDiscount.amount.toFixed(2)}</span>
          </div>
        )}

        {deliveryType === 'delivery' && (
          <div className="flex justify-between">
            <span>Delivery Fee</span>
            {freeDeliveryDiscountApplied ? (
              <span className="font-semibold text-green-600">Free</span>
            ) : (
              <span>kr.{deliveryFee.toFixed(2)}</span>
            )}
          </div>
        )}

        <BagFeeRow />

        {adminFee > 0 && (
          <div className="flex justify-between">
            <span>Admin Fee</span>
            <span>kr.{adminFee.toFixed(2)}</span>
          </div>
        )}

        <Separator />
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>kr.{checkoutTotal.toFixed(2)}</span>
        </div>

        {vatAmount > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>VAT Included ({brand?.vatPercentage || 25}%)</span>
            <span>kr.{vatAmount.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutForm({ location }: { location: Location }) {
  const { trackEvent } = useAnalytics();
  const {
    cartItems,
    subtotal,
    checkoutTotal,
    brand,
    applyDiscount,
    removeDiscount,
    appliedDiscount,
    deliveryType,
    deliveryFee,
    freeDeliveryDiscountApplied,
    itemCount,
    bagFee,
    adminFee,
    vatAmount,
    selectedTime,
    itemDiscount,
    cartDiscount,
    voucherDiscount,
    saveCartForCheckout,
    setSelectedTime
  } = useCart();

  const { toast } = useToast();
  const params = useParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const requestInFlight = useRef(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [isTimeDialogOpen, setIsTimeDialogOpen] = useState(false);
  const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);
  const [isLoadingTimes, setIsLoadingTimes] = useState(true);
  const [isDiscountErrorOpen, setIsDiscountErrorOpen] = useState(false);
  const [discountErrorMessage, setDiscountErrorMessage] = useState('');
  const [newsletterOffer, setNewsletterOffer] = useState<NewsletterDiscountOffer | null>(null);

  const [checkoutStep, setCheckoutStep] = useState<'form' | 'upsell'>('form');

  const [activeUpsell, setActiveUpsell] =
    useState<{ upsell: Upsell; products: ProductForMenu[] } | null>(null);

  const minOrderAmount = location?.minOrder ?? 0;
  const isDeliveryBelowMinOrder = deliveryType === 'delivery' && subtotal < minOrderAmount;

  useEffect(() => {
    if (!location?.id) return;
    const refresh = () => { setTimeSlots(calculateTimeSlots(location)); setIsLoadingTimes(false); };
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [location]);

  const availableTimes = timeSlots
    ? deliveryType === 'delivery'
      ? timeSlots.delivery_times
      : timeSlots.pickup_times
    : [];

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      street: '',
      zipCode: '',
      city: '',
      subscribeToNewsletter: false,
      acceptTerms: false
    }
  });

  const newsletterSelected = form.watch('subscribeToNewsletter');
  const newsletterEmail = form.watch('email');

  useEffect(() => {
    let cancelled = false;
    setNewsletterOffer(null);
    if (!brand || !location || !deliveryType || !z.string().email().safeParse(newsletterEmail.trim()).success) {
      setNewsletterOffer(null);
      return;
    }

    const timer = setTimeout(() => { void getNewsletterSignupDiscountAction(
      brand.id,
      location.id,
      subtotal,
      deliveryType,
      newsletterEmail,
    ).then(offer => {
      if (!cancelled) setNewsletterOffer(offer);
    }).catch(() => {
      if (!cancelled) setNewsletterOffer(null);
    }); }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [brand, location, subtotal, deliveryType, newsletterEmail]);

  useEffect(() => {
    if (
      newsletterSelected &&
      newsletterOffer &&
      (!appliedDiscount || appliedDiscount.applicationType === 'newsletter_signup')
    ) {
      applyDiscount({
        ...newsletterOffer,
        brandId: brand!.id,
        locationIds: [location!.id],
        code: 'Newsletter signup',
        isActive: true,
        orderTypes: [deliveryType!],
        activeDays: [],
        activeTimeSlots: [],
        usageLimit: 0,
        usedCount: 0,
        perCustomerLimit: 1,
        firstTimeCustomerOnly: false,
        allowStacking: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else if ((!newsletterSelected || !newsletterOffer) && appliedDiscount?.applicationType === 'newsletter_signup') {
      removeDiscount();
    }
  }, [newsletterSelected, newsletterOffer, appliedDiscount?.applicationType, applyDiscount, removeDiscount, brand, location, deliveryType]);

  const handleApplyDiscount = useCallback(async () => {
    if (!discountCode || !brand || !location || !deliveryType || requestInFlight.current || paymentUncertain || paymentUrl) return;
    requestInFlight.current = true;

    setIsProcessing(true);
    try {
      const currentDiscountableSubtotal = cartItems
        .filter(item => !isLockedItem(item))
        .reduce((sum, item) => {
          const toppingsTotal = item.toppings.reduce((tTotal, t) => tTotal + t.price, 0);
          return sum + (item.basePrice + toppingsTotal) * item.quantity;
        }, 0);

      const result = await optionalCheckoutValue(() => validateDiscountAction(
        discountCode,
        brand.id,
        location.id,
        currentDiscountableSubtotal,
        deliveryType,
        form.getValues('email')
      ), { success: false, message: 'Discount could not be checked. Please try again.' }, 8000);

      if (result.success && result.discount) {
        applyDiscount(result.discount);
        toast({ title: 'Success!', description: 'Discount code applied.' });
      } else {
        removeDiscount();
        setDiscountErrorMessage(result.message);
        setIsDiscountErrorOpen(true);
      }
    } finally {
      requestInFlight.current = false;
      setIsProcessing(false);
    }
  }, [paymentUncertain, paymentUrl, form, discountCode, brand, location, deliveryType, cartItems, applyDiscount, removeDiscount, toast]);

  useEffect(() => {
    try {
      const hasTracked = sessionStorage.getItem('checkout_started');
      if (!hasTracked) {
        trackEvent('start_checkout', {
          cartValue: checkoutTotal,
          itemsCount: itemCount,
          deliveryType: deliveryType
        });
        sessionStorage.setItem('checkout_started', 'true');
      }
    } catch { /* Browser storage and analytics are optional. */ }
  }, [trackEvent, checkoutTotal, itemCount, deliveryType]);

  useEffect(() => {
    const subscription = form.watch((_, { name, type }) => {
      if (type === 'change' && ['name', 'email', 'phone'].includes(name as string)) {
        try {
          const hasTracked = sessionStorage.getItem('customer_info_started');
          if (!hasTracked) {
            trackEvent('customer_info_started');
            sessionStorage.setItem('customer_info_started', 'true');
          }
        } catch { /* Browser storage and analytics are optional. */ }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, trackEvent]);

  const asapText = useMemo(() => {
    if (!timeSlots) return "Loading...";
    const text = deliveryType === 'delivery' ? timeSlots.asap_delivery : timeSlots.asap_pickup;
    return text || "Currently unavailable";
  }, [timeSlots, deliveryType]);

  const displayTime = selectedTime === 'asap' ? asapText : displayFulfillmentTime(selectedTime);

  const isOrderTimeValid = useMemo(() => {
    try { if (!deliveryType) return false; resolveFulfillmentTime(location, deliveryType, selectedTime); return true; }
    catch { return false; }
  }, [location, selectedTime, deliveryType, timeSlots]);

  const proceedToStripe = async (formValues: CheckoutFormValues) => {
      // A slow payment request is not evidence that no session exists. Keep the
      // submission locked until a definitive response; never race it with retry.
      const waiting = setTimeout(() => setCheckoutError('Payment is taking longer than usual. Please keep this page open while we check it.'), 15000);
      try {
      if (!brand || !location) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            'Brand or location information is missing. Please refresh and try again.'
        });
        setIsProcessing(false);
        return;
      }

      try { trackEvent('click_purchase', { cartValue: checkoutTotal }); } catch { /* Optional telemetry. */ }

      const totalDiscount =
        (itemDiscount || 0) + (cartDiscount?.amount || 0) + (voucherDiscount?.amount || 0);

      const effectiveCartLevelDiscount = voucherDiscount ?? cartDiscount;
      const paymentDetails: Omit<PaymentDetails, 'paymentRefId'> = {
        subtotal,
        deliveryFee: freeDeliveryDiscountApplied ? 0 : deliveryFee,
        bagFee,
        adminFee,
        vatAmount,
        discountTotal: totalDiscount,
        itemDiscountTotal: itemDiscount,
        cartDiscountTotal: effectiveCartLevelDiscount?.amount,
        cartDiscountName: effectiveCartLevelDiscount?.name,
        tips: 0,
        taxes: 0
      };

      // Recheck even if the page or an upsell dialog has been open for a while.
      try { resolveFulfillmentTime(location, deliveryType!, selectedTime); }
      catch { setCheckoutError('Please choose a new available order time.'); setIsTimeDialogOpen(true); return; }
      const finalDeliveryTime = selectedTime;
      let anonymousId: string | undefined;
      try { anonymousId = Cookies.get('orderfly_anonymous_id'); } catch { /* Optional consent linkage. */ }

      const minimalCartItems = checkoutItems(cartItems);

      // The server receives an explicit consent boolean.
      const customerInfo: CustomerInfo = {
        ...formValues,
        subscribeToNewsletter: !!formValues.subscribeToNewsletter
      };

      const result = await requestHostedCheckout(
        minimalCartItems,
        customerInfo,
        deliveryType!,
        brand!.id,
        location!.id,
        paymentDetails,
        appliedDiscount?.id || null,
        brand!.slug,
        location!.slug,
        finalDeliveryTime,
        anonymousId
      );

      setCheckoutError(null);
      if (result.success && result.url) {
        // Keep the URL if navigation is interrupted, so continuing never creates
        // a second order. Storage failure must not prevent hosted payment.
        setPaymentUrl(result.url);
        try { if (result.orderId) saveCartForCheckout(result.orderId); } catch { /* Best-effort browser persistence. */ }
        window.location.assign(result.url);
      } else {
        setPaymentUncertain(result.retryable === false);
        setCheckoutError(result.error || 'Payment could not be opened. Please try again.');
      }
      } catch {
        setPaymentUncertain(true);
        setCheckoutError('We could not confirm whether the payment page was created. Please contact the restaurant before starting another payment.');
      } finally {
        clearTimeout(waiting);
      }
  };

  const submitCheckout = async (formValues: CheckoutFormValues, skipUpsell = false) => {
    if (requestInFlight.current || paymentUncertain || paymentUrl || (activeUpsell && !skipUpsell)) return;
    setCheckoutError(null);
    if (!brand || !location || !deliveryType || !cartItems.length || isDeliveryBelowMinOrder || !isOrderTimeValid) {
      setCheckoutError('Please check your basket, delivery method and available order time.');
      return;
    }
    if (deliveryType === 'delivery' && (!formValues.street?.trim() || !formValues.zipCode?.trim() || !formValues.city?.trim())) {
      if (!formValues.street?.trim()) form.setError('street', { message: 'Street name is required.' });
      if (!formValues.zipCode?.trim()) form.setError('zipCode', { message: 'Postal code is required.' });
      if (!formValues.city?.trim()) form.setError('city', { message: 'City is required.' });
      setCheckoutError('Please complete your delivery address.');
      return;
    }
    requestInFlight.current = true;
    setIsProcessing(true);
    try {
      if (!skipUpsell) {
        const upsellData = await optionalCheckoutValue(() => getActiveUpsellForCart({
          brandId: brand.id,
          locationId: location.id,
          deliveryType,
          cartItems: cartItems.map(item => ({ id: item.id, categoryId: item.categoryId, itemType: item.itemType, tags: item.tags })),
          cartTotal: cartItems.filter(item => !isLockedItem(item)).reduce((sum, item) =>
            sum + (item.basePrice + item.toppings.reduce((total, topping) => total + topping.price, 0)) * item.quantity, 0),
          excludedUpsellIds: handledUpsells(),
        }), null);
        if (upsellData) {
          markUpsellHandled(upsellData.upsell.id);
          setActiveUpsell(upsellData);
          setCheckoutStep('upsell');
          return;
        }
      }
      await proceedToStripe(formValues);
    } finally {
      requestInFlight.current = false;
      setIsProcessing(false);
    }
  };

  const showValidationError = () => setCheckoutError('Please check the highlighted fields before continuing to payment.');
  const handleFormSubmit: React.FormEventHandler<HTMLFormElement> = event => {
    if (paymentUrl) {
      event.preventDefault();
      // Retry navigation to the existing session, never a new checkout request.
      if (!isProcessing) window.location.assign(paymentUrl);
      return;
    }
    void form.handleSubmit(values => submitCheckout(values), showValidationError)(event);
  };
  const onUpsellDialogContinue = () => {
    setActiveUpsell(null);
    setCheckoutStep('form');
    // Validate again after the dialog; do not bypass required customer fields.
    void form.handleSubmit(values => submitCheckout(values, true), showValidationError)();
  };

  const handleRemoveDiscount = () => {
    removeDiscount();
    setDiscountCode('');
  };

  if (cartItems.length === 0 && !isProcessing) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold">Your Cart is Empty</h1>
        <p className="text-muted-foreground">You can't check out with an empty cart.</p>
        <Button asChild className="mt-4">
          <Link href={`/${params.brandSlug}/${params.locationSlug}`}>Back to Menu</Link>
        </Button>
      </div>
    );
  }

  const isTermsAccepted = form.watch('acceptTerms');
  const isFormLocked = isProcessing || paymentUncertain || !!paymentUrl;

  const AcceptTermsAndCompleteOrder = ({ isSticky }: { isSticky?: boolean }) => (
    <div className={cn(isSticky && "container mx-auto max-w-[1140px] px-0")}>
      {isDeliveryBelowMinOrder && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            Minimum order for delivery is not met (kr. {minOrderAmount.toFixed(2)})
          </AlertTitle>
        </Alert>
      )}
      <div className={cn("mb-4 bg-background", isSticky ? 'px-4' : 'px-0')}>
        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isFormLocked}
                  className="h-5 w-5"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm">
                  I accept the{" "}
                  <Link
                    href={brand?.termsUrl || '/terms'}
                    target="_blank"
                    className="underline"
                  >
                    terms and conditions
                  </Link>
                  .
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
      </div>
      <Button
        type="submit"
        className={cn(
          "w-full font-bold",
          isSticky ? "h-16 rounded-none text-base" : "h-12 text-lg"
        )}
        disabled={
          isProcessing || (!paymentUrl && (
            paymentUncertain || !!activeUpsell || !isTermsAccepted ||
            isDeliveryBelowMinOrder || !isOrderTimeValid
          ))
        }
      >
        <div className="flex w-full justify-between items-center px-4">
          <span>{isProcessing ? <><Loader2 className="inline animate-spin mr-2" />Opening payment…</> : 'Complete Order'}</span>
          <span>kr. {checkoutTotal.toFixed(2)}</span>
        </div>
      </Button>
      {checkoutError && <p role="alert" className="mt-3 text-sm text-destructive">{checkoutError}</p>}
    </div>
  );

  return (
    <>
      <div className="mb-6">
        {isProcessing || paymentUncertain || paymentUrl ? (
          <Button type="button" variant="outline" disabled><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back to Menu</Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link href={`/${params.brandSlug}/${params.locationSlug}?deliveryMethod=${deliveryType || 'pickup'}`}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back to Menu
            </Link>
          </Button>
        )}
      </div>
      <FormProvider {...form}>
        <form onSubmit={handleFormSubmit} noValidate>
          <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2 lg:gap-y-12 pb-32 lg:pb-0">
            {/* Left column */}
            <fieldset className="min-w-0 space-y-10" disabled={isFormLocked}>
              <section>
                <h2 className="text-2xl font-bold mb-4">Delivery & Time</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
                    <div className="flex items-center gap-3">
                      {deliveryType === 'delivery' ? (
                        <Truck className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <Store className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-semibold capitalize">{deliveryType}</p>
                        {deliveryType === 'pickup' && location && (
                          <p className="text-sm text-muted-foreground">
                            {location.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-6 w-6 text-muted-foreground" />
                      <div>
                        {isLoadingTimes ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <p className="font-semibold">{displayTime}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setIsTimeDialogOpen(true)}
                      disabled={isLoadingTimes}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">Customer Information</h2>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+123456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {deliveryType === 'delivery' && (
                    <>
                      <FormField
                        control={form.control}
                        name="street"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Name</FormLabel>
                            <FormControl>
                              <Input placeholder="123 Main St" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="zipCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Postal Code</FormLabel>
                              <FormControl>
                                <Input placeholder="12345" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City</FormLabel>
                              <FormControl>
                                <Input placeholder="Anytown" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}
                  <Separator className="!mt-6" />
                  <FormField
                    control={form.control}
                    name="subscribeToNewsletter"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Subscribe to newsletter</FormLabel>
                          <FormDescription>
                            {newsletterOffer
                              ? `Receive updates and get ${newsletterOffer.discountType === 'percentage' ? `${newsletterOffer.discountValue}%` : `kr. ${newsletterOffer.discountValue.toFixed(2)}`} off this order.`
                              : 'Receive updates and special offers from us.'}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">Discount Code</h2>
                {appliedDiscount && appliedDiscount.applicationType !== 'newsletter_signup' ? (
                  <div className="flex justify-between items-center text-green-600">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span>
                        Discount Applied:{" "}
                        <span className="font-mono">{appliedDiscount.code}</span>
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={handleRemoveDiscount}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Enter discount code"
                      className="h-9"
                      value={discountCode}
                      onChange={e => setDiscountCode(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyDiscount}
                      disabled={isProcessing || !discountCode}
                    >
                      {isProcessing ? <Loader2 className="animate-spin" /> : 'Apply'}
                    </Button>
                  </div>
                )}
              </section>

              <div className="lg:hidden">
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={'item-1'}
                  className="w-full"
                >
                  <AccordionItem value="item-1">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        <h2 className="text-lg font-bold">
                          Order summary ({itemCount} items)
                        </h2>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <OrderSummaryContent />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </fieldset>

            {/* Right column (desktop) */}
            <div className="hidden lg:block">
              <div className="flex flex-col sticky top-6 h-[calc(100vh-3rem)]">
                <Card className="flex flex-col flex-1">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                    <CardDescription>Review the items in your cart.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto pr-4">
                    <fieldset className="min-w-0" disabled={isFormLocked}>
                      <OrderSummaryContent />
                    </fieldset>
                  </CardContent>
                </Card>
                <div className="p-4 bg-background border border-t-0 rounded-b-lg">
                  <AcceptTermsAndCompleteOrder />
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-0 z-50 lg:hidden">
            <AcceptTermsAndCompleteOrder isSticky />
          </div>
        </form>
      </FormProvider>

      {location && (
        <TimeSlotDialog
          isOpen={isTimeDialogOpen}
          setIsOpen={setIsTimeDialogOpen}
          locationId={location.id}
        />
      )}

      <AlertDialog open={isDiscountErrorOpen} onOpenChange={setIsDiscountErrorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid Discount Code</AlertDialogTitle>
            <AlertDialogDescription>{discountErrorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsDiscountErrorOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeUpsell && (
        <UpsellDialog
          isOpen={checkoutStep === 'upsell'}
          setIsOpen={open => {
            if (!open) {
              setActiveUpsell(null);
              setCheckoutStep('form');
            }
          }}
          upsellData={activeUpsell}
          onContinue={onUpsellDialogContinue}
        />
      )}
    </>
  );
}

export function CheckoutClient({ brand, location }: CheckoutClientProps) {
  const { setCartContext, cartReady } = useCart();
  React.useEffect(() => { setCartContext(brand, location); }, [brand, location, setCartContext]);
  // Hosted Checkout needs only the server-created URL, not Stripe.js or Elements.
  if (!cartReady) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  return <CheckoutForm location={location} />;
}
