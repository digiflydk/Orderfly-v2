'use client';
import {NEWSLETTER_CONSENT_VERSION,newsletterConsentText} from '@/lib/marketing/consent';
import {formatPrice,localizeTime} from '@/lib/storefront-format';
import { useCheckoutKeyboard } from '@/hooks/use-checkout-keyboard';
import { statisticsAllowed } from '@/lib/analytics';

import { resolveFulfillmentTime, displayFulfillmentTime } from '@/lib/fulfillment-time';
import { checkoutItems } from '@/lib/checkout-items';
import { requestHostedCheckout } from '@/lib/checkout-request';
import { optionalCheckoutValue } from '@/lib/optional-checkout';

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
  name: z.string().min(2, "Indtast dit navn"),
  email: z.string().email("Indtast en gyldig e-mailadresse"),
  phone: z.string().min(5, "Indtast dit telefonnummer"),
  street: z.string().optional(),
  zipCode: z.string().optional(),
  city: z.string().optional(),
  subscribeToNewsletter: z.boolean().default(false),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "Du skal acceptere handelsbetingelserne."
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
          <span>Pose</span>
        </div>
        <span>{formatPrice(brand.bagFee)}</span>
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
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>Ja, fjern</AlertDialogAction>
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
                        {formatPrice(discountedLinePrice)}
                      </span>
                      <span className="text-muted-foreground line-through ml-2">
                        {formatPrice(originalLinePrice)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatPrice(discountedLinePrice)}
                    </span>
                  )}
                </p>
                {item.toppings.length > 0 && (
                  <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                    {item.toppings.map(topping => (
                      <li key={topping.name}>
                        {topping.name} (+{formatPrice(topping.price)})
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
                {formatPrice((item.price * item.quantity + toppingsPrice))}
              </p>
            </div>
          </div>
        );
      })}
      <Separator />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Varer</span>
          <span>{formatPrice(subtotal)}</span>
        </div>

        {itemDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Varerabat</span>
            <span>- {formatPrice(itemDiscount)}</span>
          </div>
        )}
        {cartDiscount && (
          <div className="flex justify-between text-green-600">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>{cartDiscount.name}</span>
            </div>
            <span>- {formatPrice(cartDiscount.amount)}</span>
          </div>
        )}
        {voucherDiscount && (
          <div className="flex justify-between text-green-600">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              <span>Code: {voucherDiscount.name}</span>
            </div>
            <span>- {formatPrice(voucherDiscount.amount)}</span>
          </div>
        )}

        {deliveryType === 'delivery' && (
          <div className="flex justify-between">
            <span>Levering</span>
            {freeDeliveryDiscountApplied ? (
              <span className="font-semibold text-green-600">Gratis</span>
            ) : (
              <span>{formatPrice(deliveryFee)}</span>
            )}
          </div>
        )}

        <BagFeeRow />

        {adminFee > 0 && (
          <div className="flex justify-between">
            <span>Servicegebyr</span>
            <span>{formatPrice(adminFee)}</span>
          </div>
        )}

        <Separator />
        <div className="flex justify-between font-bold text-lg">
          <span>I alt</span>
          <span>{formatPrice(checkoutTotal)}</span>
        </div>

        {vatAmount > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>VAT Included ({brand?.vatPercentage || 25}%)</span>
            <span>{formatPrice(vatAmount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutForm({ location }: { location: Location }) {
  const keyboardOpen = useCheckoutKeyboard();
  const { trackEvent, sessionId: analyticsSessionId } = useAnalytics();
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

  const consentAttempt = React.useRef<{key:string;id:string}|null>(null);
  const newsletterSelected = form.watch('subscribeToNewsletter');
  const newsletterEmail = form.watch('email');
  useEffect(()=>{consentAttempt.current=null;},[newsletterSelected,newsletterEmail]);
  const newsletterBase = cartItems.filter(item=>!isLockedItem(item)).reduce((n,item)=>n+(item.basePrice+item.toppings.reduce((sum,t)=>sum+t.price,0))*item.quantity,0);
  const newsletterPotential = newsletterOffer ? Math.min(newsletterBase,newsletterOffer.discountType==='percentage'?newsletterBase*newsletterOffer.discountValue/100:newsletterOffer.discountValue) : 0;
  const newsletterBenefitAvailable = !!newsletterOffer && newsletterPotential>0 && newsletterPotential>(cartDiscount?.amount || 0) && (!appliedDiscount || appliedDiscount.applicationType==='newsletter_signup');
  const newsletterSavingApplied = !!newsletterOffer && newsletterSelected && !!voucherDiscount?.amount &&
    appliedDiscount?.applicationType === 'newsletter_signup' && appliedDiscount.id === newsletterOffer.id;

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
        code: 'Nyhedsbrev',
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
      ), { success: false, message: 'Rabatten kunne ikke kontrolleres. Prøv igen.' }, 8000);

      if (result.success && result.discount) {
        applyDiscount(result.discount);
        toast({ title: 'Rabat tilføjet', description: 'Rabatkoden er tilføjet.' });
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

  const checkoutTracked = useRef('');
  useEffect(() => {
    const key = `${brand?.id}/${location?.id}`;
    if (!itemCount || checkoutTracked.current === key) return;
    if (trackEvent('start_checkout', {locationId: location?.id, cartValue: checkoutTotal, itemsCount: itemCount, deliveryType})) checkoutTracked.current = key;
  }, [trackEvent, brand?.id, location?.id, checkoutTotal, itemCount, deliveryType]);

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
      const waiting = setTimeout(() => setCheckoutError('Det tager lidt længere tid at åbne betalingen. Hold siden åben, mens vi kontrollerer den.'), 15000);
      try {
      if (!brand || !location) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description:
            'Restaurantoplysninger mangler. Genindlæs siden og prøv igen.'
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
      catch { setCheckoutError('Vælg et nyt ledigt tidspunkt.'); setIsTimeDialogOpen(true); return; }
      const finalDeliveryTime = selectedTime;
      let anonymousId: string | undefined;
      try { anonymousId = Cookies.get('orderfly_anonymous_id'); } catch { /* Optional consent linkage. */ }

      const minimalCartItems = checkoutItems(cartItems);

      if(formValues.subscribeToNewsletter) {
        const key=`${brand.id}/${formValues.email.trim().toLowerCase()}`;
        if(consentAttempt.current?.key!==key)consentAttempt.current={key,id:crypto.randomUUID()};
      }
      // The server receives an explicit consent boolean and stable retry identity.
      const customerInfo: CustomerInfo = {
        ...formValues,
        subscribeToNewsletter: !!formValues.subscribeToNewsletter,
        ...(formValues.subscribeToNewsletter && consentAttempt.current ? {newsletterConsentId:consentAttempt.current.id,newsletterConsentVersion:NEWSLETTER_CONSENT_VERSION}:{}),
        ...(statisticsAllowed() && analyticsSessionId ? {analyticsSessionId, analyticsConsent: true, analyticsDevice: window.innerWidth < 768 ? 'mobile' as const : 'desktop' as const} : {})
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
        setCheckoutError(result.error || 'Betalingen kunne ikke åbnes. Prøv igen.');
      }
      } catch {
        setPaymentUncertain(true);
        setCheckoutError('Vi kunne ikke bekræfte, om betalingen blev oprettet. Kontakt restauranten, før du starter en ny betaling.');
      } finally {
        clearTimeout(waiting);
      }
  };

  const submitCheckout = async (formValues: CheckoutFormValues) => {
    if (requestInFlight.current || paymentUncertain || paymentUrl) return;
    setCheckoutError(null);
    if (!brand || !location || !deliveryType || !cartItems.length || isDeliveryBelowMinOrder || !isOrderTimeValid) {
      setCheckoutError('Kontrollér kurven, leveringsmetoden og tidspunktet.');
      return;
    }
    if (deliveryType === 'delivery' && (!formValues.street?.trim() || !formValues.zipCode?.trim() || !formValues.city?.trim())) {
      if (!formValues.street?.trim()) form.setError('street', { message: 'Indtast din adresse.' });
      if (!formValues.zipCode?.trim()) form.setError('zipCode', { message: 'Indtast postnummer.' });
      if (!formValues.city?.trim()) form.setError('city', { message: 'Indtast by.' });
      setCheckoutError('Udfyld leveringsadressen.');
      return;
    }
    requestInFlight.current = true;
    setIsProcessing(true);
    try {
      await proceedToStripe(formValues);
    } finally {
      requestInFlight.current = false;
      setIsProcessing(false);
    }
  };

  const showValidationError = () => setCheckoutError('Kontrollér de markerede felter, før du går til betaling.');
  const handleFormSubmit: React.FormEventHandler<HTMLFormElement> = event => {
    if (paymentUrl) {
      event.preventDefault();
      // Retry navigation to the existing session, never a new checkout request.
      if (!isProcessing) window.location.assign(paymentUrl);
      return;
    }
    void form.handleSubmit(values => submitCheckout(values), showValidationError)(event);
  };
  const handleRemoveDiscount = () => {
    removeDiscount();
    setDiscountCode('');
  };

  if (cartItems.length === 0 && !isProcessing) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold">Din kurv er tom</h1>
        <p className="text-muted-foreground">You can't check out with an empty cart.</p>
        <Button asChild className="mt-4">
          <Link href={`/${params.brandSlug}/${params.locationSlug}`}>Tilbage til menuen</Link>
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
            Minimumsbestillingen til levering er ikke nået ({formatPrice(minOrderAmount)})
          </AlertTitle>
        </Alert>
      )}
      <div className={cn("mb-4 bg-background", isSticky ? 'px-4' : 'px-0')}>
        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem className="commerce-terms flex flex-row items-center gap-3 space-y-0">
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
                  Jeg accepterer{" "}
                  <Link
                    href={brand?.termsUrl || '/terms'}
                    target="_blank"
                    className="underline"
                  >
                    handelsbetingelserne
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
          isSticky ? "h-[73.6px] rounded-none text-base" : "h-[55.2px] text-lg"
        )}
        disabled={
          isProcessing || (!paymentUrl && (
            paymentUncertain || !isTermsAccepted ||
            isDeliveryBelowMinOrder || !isOrderTimeValid
          ))
        }
      >
        <div className="flex w-full justify-between items-center px-4">
          <span>{isProcessing ? <><Loader2 className="inline animate-spin mr-2" />Åbner betaling…</> : 'Gå til betaling'}</span>
          <span>{formatPrice(checkoutTotal)}</span>
        </div>
      </Button>
      {checkoutError && <p role="alert" className="mt-3 text-sm text-destructive">{checkoutError}</p>}
    </div>
  );

  return (
    <>
      <div className="mb-6">
        {isProcessing || paymentUncertain || paymentUrl ? (
          <Button type="button" variant="outline" disabled><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Tilbage til menuen</Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link href={`/${params.brandSlug}/${params.locationSlug}?deliveryMethod=${deliveryType || 'pickup'}`}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Tilbage til menuen
            </Link>
          </Button>
        )}
      </div>
      <FormProvider {...form}>
        <form data-commerce-root data-keyboard-open={keyboardOpen} onSubmit={handleFormSubmit} noValidate>
          <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2 lg:gap-y-12 pb-44 lg:pb-0">
            {/* Left column */}
            <fieldset className="min-w-0 space-y-10" disabled={isFormLocked}>
              <section>
                <h2 className="text-2xl font-bold mb-4">Levering og tidspunkt</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
                    <div className="flex items-center gap-3">
                      {deliveryType === 'delivery' ? (
                        <Truck className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <Store className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-semibold capitalize">{deliveryType==='delivery'?'Levering':'Afhentning'}</p>
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
                          <p className="font-semibold">{localizeTime(displayTime)}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setIsTimeDialogOpen(true)}
                      disabled={isLoadingTimes}
                    >
                      Ændr tidspunkt
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">Dine oplysninger</h2>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fulde navn</FormLabel>
                        <FormControl>
                          <Input autoComplete="name" enterKeyHint="next" placeholder="John Doe" {...field} />
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
                        <FormLabel>E-mail</FormLabel>
                        <FormControl>
                          <Input autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" type="email" placeholder="john@example.com" {...field} />
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
                        <FormLabel>Telefonnummer</FormLabel>
                        <FormControl>
                          <Input autoComplete="tel" inputMode="tel" enterKeyHint="next" type="tel" placeholder="+123456789" {...field} />
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
                            <FormLabel>Adresse</FormLabel>
                            <FormControl>
                              <Input autoComplete="address-line1" enterKeyHint="next" placeholder="Vejnavn og husnummer" {...field} />
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
                              <FormLabel>Postnummer</FormLabel>
                              <FormControl>
                                <Input autoComplete="postal-code" inputMode="numeric" enterKeyHint="next" placeholder="Postnummer" {...field} />
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
                              <FormLabel>By</FormLabel>
                              <FormControl>
                                <Input autoComplete="address-level2" enterKeyHint="done" placeholder="By" {...field} />
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
                      <FormItem data-newsletter-offer={newsletterBenefitAvailable} className="commerce-newsletter flex flex-row items-start gap-3 space-y-0 rounded-xl border p-5">
                        <FormControl>
                          <Checkbox
                            checked={!!field.value}
                            onCheckedChange={checked=>{field.onChange(checked);trackEvent('newsletter_opt_in_selected',{value:checked===true?1:0});}}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-semibold leading-relaxed">{newsletterBenefitAvailable && newsletterOffer ? `Få ${newsletterOffer.discountType==='percentage'?`${newsletterOffer.discountValue}%`:formatPrice(newsletterOffer.discountValue)} ved tilmelding` : 'Få nyheder og tilbud'}</FormLabel>
                          <FormDescription>
                            {newsletterConsentText(brand?.name || 'restauranten')}
                            {newsletterSavingApplied && <span className="block mt-2 font-semibold text-green-700">Nyhedsbrevsrabatten er valgt til denne ordre.</span>}
                            {newsletterOffer && !newsletterBenefitAvailable && <span className="block mt-2">Dine nuværende rabatter eller menupriser bevares. Nyhedsbrevsrabatten lægges ikke oveni.</span>}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <details open={appliedDiscount && appliedDiscount.applicationType!=='newsletter_signup' ? true : undefined} className="rounded-lg border p-4">
                <summary className="cursor-pointer font-semibold min-h-11 flex items-center">Har du en rabatkode?</summary>
                {appliedDiscount && appliedDiscount.applicationType !== 'newsletter_signup' ? (
                  <div className="flex justify-between items-center text-green-600">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <span>
                        Rabatkode:{" "}
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
                      placeholder="Indtast rabatkode"
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
                      {isProcessing ? <Loader2 className="animate-spin" /> : 'Anvend'}
                    </Button>
                  </div>
                )}
              </details>

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
                          Ordreoversigt ({itemCount} varer)
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
                    <CardTitle>Ordreoversigt</CardTitle>
                    <CardDescription>Kontrollér varerne i din kurv.</CardDescription>
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

          <div className="commerce-checkout-bar fixed bottom-0 left-0 right-0 bg-background border-t p-0 z-50 lg:hidden">
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
            <AlertDialogTitle>Rabatkoden kunne ikke bruges</AlertDialogTitle>
            <AlertDialogDescription>{discountErrorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsDiscountErrorOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
