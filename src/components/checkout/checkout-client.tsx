
'use client';

import { useCart } from "@/context/cart-context";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import Link from "next/link";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useEffect, useState, useTransition, useMemo } from "react";
import { createStripeCheckoutSessionAction, validateDiscountAction } from "@/app/checkout/actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Tag, Truck, Store, Clock, MapPin, Check, ShoppingCart, AlertTriangle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useParams, useRouter } from "next/navigation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { PaymentDetails, TimeSlotResponse, MinimalCartItem, Location } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { getTimeSlots } from "@/app/superadmin/locations/actions";
import { TimeSlotDialog } from "./timeslot-dialog";
import { Alert, AlertTitle } from "../ui/alert";
import Cookies from "js-cookie";
import { useAnalytics } from '@/context/analytics-context';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { cn } from "@/lib/utils";


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

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

interface CheckoutClientProps {
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
        return null; // Don't show the row if the user has removed the bag
    }

    return (
        <>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={handleRemove}>
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
    const { cartItems, subtotal, checkoutTotal, itemDiscount, cartDiscount, deliveryFee, brand, adminFee, vatAmount, deliveryType, freeDeliveryDiscountApplied } = useCart();
    return (
        <div className="space-y-4">
            {cartItems.map(item => {
                const toppingsPrice = item.toppings.reduce((sum, topping) => sum + topping.price, 0) * item.quantity;
                const originalLinePrice = item.basePrice * item.quantity + toppingsPrice;
                const discountedLinePrice = item.price * item.quantity + toppingsPrice;
                const hasDiscount = originalLinePrice > discountedLinePrice;

                return (
                <div key={item.cartItemId} className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                         <div className="relative h-16 w-16 shrink-0">
                             <Image src={item.imageUrl || 'https://placehold.co/100x100.png'} alt={item.productName} fill className="rounded-md object-cover" data-ai-hint="delicious food"/>
                        </div>
                        <div>
                            <div className="font-medium">{item.productName} {item.itemType === 'combo' && <Badge>Combo</Badge>}</div>
                            <p className="text-sm">
                                {hasDiscount ? (
                                    <>
                                        <span className="font-bold text-foreground"> kr.{discountedLinePrice.toFixed(2)}</span>
                                        <span className="text-muted-foreground line-through ml-2">kr.{originalLinePrice.toFixed(2)}</span>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">kr.{discountedLinePrice.toFixed(2)}</span>
                                )}
                            </p>
                            {item.toppings.length > 0 && (
                                <ul className="text-xs text-muted-foreground pl-4 mt-1 list-disc">
                                    {item.toppings.map(topping => (
                                        <li key={topping.name}>{topping.name} (+kr.{topping.price.toFixed(2)})</li>
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
                        <p className="font-medium">kr. {(item.price * item.quantity + toppingsPrice).toFixed(2)}</p>
                    </div>
                </div>
            )})}
            <Separator />
            <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>kr.{subtotal.toFixed(2)}</span></div>
                
                {itemDiscount > 0 && (
                   <div className="flex justify-between text-green-600">
                        <span>Product Discounts</span>
                        <span>- kr.{itemDiscount.toFixed(2)}</span>
                    </div>
                )}
                {cartDiscount && (
                     <div className="flex justify-between text-green-600">
                        <div className="flex items-center gap-1"><Tag className="h-4 w-4"/><span>{cartDiscount.name}</span></div>
                        <span>- kr.{cartDiscount.amount.toFixed(2)}</span>
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
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span>kr.{checkoutTotal.toFixed(2)}</span></div>
                
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
        cartItems, subtotal, checkoutTotal, brand, applyDiscount, removeDiscount, 
        appliedDiscount, deliveryType, deliveryFee, finalDiscount, itemCount, bagFee, adminFee, vatAmount,
        selectedTime, itemDiscount, cartDiscount, freeDeliveryDiscountApplied, setCartContext, setSelectedTime
    } = useCart();
    
    const router = useRouter();
    const { toast } = useToast();
    const params = useParams();
    const [isPending, startTransition] = useTransition();
    const [discountCode, setDiscountCode] = useState('');
    const [isTimeDialogOpen, setIsTimeDialogOpen] = useState(false);
    const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);
    const [isLoadingTimes, setIsLoadingTimes] = useState(true);

    const minOrderAmount = location?.minOrder ?? 0;
    const isDeliveryBelowMinOrder = deliveryType === 'delivery' && subtotal < minOrderAmount;

    useEffect(() => {
        if (brand && location) {
            setCartContext(brand, location);
        }
    }, [brand, location, setCartContext]);

    useEffect(() => {
        if(location?.id) {
            setIsLoadingTimes(true);
            getTimeSlots(location.id).then(setTimeSlots).finally(() => setIsLoadingTimes(false));
        }
    }, [location?.id]);
    
    const availableTimes = timeSlots ? (deliveryType === 'delivery' ? timeSlots.delivery_times : timeSlots.pickup_times) : [];
    
    const form = useForm<CheckoutFormValues>({
        resolver: zodResolver(checkoutSchema),
        defaultValues: {
            name: '', email: '', phone: '', street: '', zipCode: '', city: '',
            subscribeToNewsletter: false, acceptTerms: false,
        },
    });

    useEffect(() => {
        const hasTracked = sessionStorage.getItem('checkout_started');
        if (!hasTracked) {
             trackEvent('start_checkout', {
                cartValue: checkoutTotal,
                itemsCount: itemCount,
                deliveryType: deliveryType,
            });
            sessionStorage.setItem('checkout_started', 'true');
        }
    }, [trackEvent, checkoutTotal, itemCount, deliveryType]);

    useEffect(() => {
        const subscription = form.watch((value, { name, type }) => {
            if (type === 'change' && ['name', 'email', 'phone'].includes(name as string)) {
                 const hasTracked = sessionStorage.getItem('customer_info_started');
                 if (!hasTracked) {
                    trackEvent('customer_info_started');
                    sessionStorage.setItem('customer_info_started', 'true');
                 }
            }
        });
        return () => subscription.unsubscribe();
    }, [form, trackEvent]);


    const asapText = useMemo(() => {
      if (!timeSlots) return "Loading...";
      const text = deliveryType === 'delivery' ? timeSlots.asap_delivery : timeSlots.asap_pickup;
      return text || "Currently unavailable";
    }, [timeSlots, deliveryType]);
    
    const displayTime = selectedTime === 'asap' ? asapText : selectedTime;
    
    const isOrderTimeValid = useMemo(() => {
        return displayTime && !displayTime.toLowerCase().includes('loading') && !displayTime.toLowerCase().includes('unavailable');
    }, [displayTime]);


    const handleFormSubmit = form.handleSubmit((values: CheckoutFormValues) => {
       if (deliveryType === 'delivery' && (!values.street || !values.zipCode || !values.city)) {
           if (!values.street) form.setError('street', { message: 'Street name is required.' });
           if (!values.zipCode) form.setError('zipCode', { message: 'Postal code is required.' });
           if (!values.city) form.setError('city', { message: 'City is required.' });
           return;
       }
       
       if (!brand || !location) {
           toast({ variant: 'destructive', title: 'Error', description: 'Brand or location information is missing. Please refresh and try again.' });
           return;
       }
       
       startTransition(async () => {
            trackEvent('click_purchase', { cartValue: checkoutTotal });

           const totalDiscount = (itemDiscount || 0) + (cartDiscount?.amount || 0);

           const paymentDetails: Omit<PaymentDetails, 'paymentRefId'> = {
                subtotal, deliveryFee, bagFee, adminFee, vatAmount,
                discountTotal: totalDiscount,
                itemDiscountTotal: itemDiscount,
                cartDiscountTotal: cartDiscount?.amount,
                cartDiscountName: cartDiscount?.name,
                tips: 0, taxes: 0, 
           };

           const finalDeliveryTime = selectedTime === 'asap' ? displayTime : selectedTime;
           
            const anonymousId = Cookies.get('orderfly_anonymous_id');

            const minimalCartItems: MinimalCartItem[] = cartItems.map(item => ({
                name: item.productName,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity + item.toppings.reduce((sum, t) => sum + t.price, 0) * item.quantity,
                toppings: item.toppings.map(t => t.name)
            }));

            const result = await createStripeCheckoutSessionAction(minimalCartItems, values, deliveryType!, brand.id, location.id, paymentDetails, appliedDiscount?.id || null, brand.slug, location.slug, finalDeliveryTime, anonymousId);

            if (result.success && result.url) {
                router.push(result.url);
            } else {
                 toast({ 
                     variant: 'destructive', 
                     title: 'Checkout Error', 
                     description: `An unexpected error occurred. Please try again. If the problem persists, one of the items in your cart may no longer be available. Details: ${result.error}`,
                     duration: 20000 
                });
            }
       });
    });

    const handleApplyDiscount = () => {
        if (!discountCode || !brand || !location) return;
        startTransition(async () => {
            const result = await validateDiscountAction(discountCode, brand.id, location.id, subtotal, deliveryType!);
            if (result.success && result.discount) {
                applyDiscount(result.discount);
            } else {
                removeDiscount();
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        })
    }
    
    const handleRemoveDiscount = () => {
        removeDiscount();
        setDiscountCode('');
    }

    if (cartItems.length === 0 && !isPending) {
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold">Your Cart is Empty</h1>
                <p className="text-muted-foreground">You can't check out with an empty cart.</p>
                <Button asChild className="mt-4">
                    <Link href={`/${params.brandSlug}/${params.locationSlug}`}>Back to Menu</Link>
                </Button>
            </div>
        )
    }
    
    const isTermsAccepted = form.watch('acceptTerms');

    const AcceptTermsAndCompleteOrder = ({ isSticky }: { isSticky?: boolean }) => (
         <div className={cn(isSticky && "container mx-auto max-w-[1140px] px-0")}>
            {isDeliveryBelowMinOrder && (
                <Alert variant="warning" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Minimum order for delivery is not met (kr. {minOrderAmount.toFixed(2)})</AlertTitle>
                </Alert>
            )}
            <div className={cn("mb-4", isSticky ? 'px-4' : 'px-0')}>
                <FormField
                    control={form.control}
                    name="acceptTerms"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                            <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm">I accept the <Link href={brand?.termsUrl || '/terms'} target="_blank" className="underline">terms and conditions</Link>.</FormLabel>
                            <FormMessage />
                        </div>
                        </FormItem>
                    )}
                />
            </div>
            <Button type="submit" className={cn("w-full font-bold", isSticky ? "h-16 rounded-none text-base" : "h-12 text-lg")} disabled={isPending || !isTermsAccepted || isDeliveryBelowMinOrder || !isOrderTimeValid}>
                <div className="flex w-full justify-between items-center px-4">
                    <span>{isPending ? <Loader2 className="animate-spin" /> : 'Complete Order'}</span>
                    <span>kr. {checkoutTotal.toFixed(2)}</span>
                </div>
            </Button>
        </div>
    );
    
    return (
        <>
            <FormProvider {...form}>
                <form onSubmit={handleFormSubmit}>
                    <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2 lg:gap-y-12 pb-32 lg:pb-0">
                        {/* --- Left Column: Info & Details --- */}
                        <div className="space-y-10">
                            <section>
                                <h2 className="text-2xl font-bold mb-4">Delivery & Time</h2>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
                                        <div className="flex items-center gap-3">
                                            {deliveryType === 'delivery' ? <Truck className="h-6 w-6 text-muted-foreground" /> : <Store className="h-6 w-6 text-muted-foreground" />}
                                            <div>
                                                <p className="font-semibold capitalize">{deliveryType}</p>
                                                {deliveryType === 'pickup' && location && (
                                                    <p className="text-sm text-muted-foreground">{location.address}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border bg-muted p-4">
                                        <div className="flex items-center gap-3">
                                            <Clock className="h-6 w-6 text-muted-foreground" />
                                            <div>
                                                {isLoadingTimes ? <Loader2 className="h-5 w-5 animate-spin"/> : (
                                                    <p className="font-semibold">{displayTime}</p>
                                                )}
                                            </div>
                                        </div>
                                        <Button type="button" variant="link" onClick={() => setIsTimeDialogOpen(true)} disabled={isLoadingTimes}>Change</Button>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h2 className="text-2xl font-bold mb-4">Customer Information</h2>
                                <div className="space-y-4">
                                    <FormField control={form.control} name="name" render={({ field }) => (
                                        <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name="email" render={({ field }) => (
                                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    <FormField control={form.control} name="phone" render={({ field }) => (
                                        <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="+123456789" {...field} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                    {deliveryType === 'delivery' && (
                                        <>
                                            <FormField control={form.control} name="street" render={({ field }) => (
                                                <FormItem><FormLabel>Street Name</FormLabel><FormControl><Input placeholder="123 Main St" {...field} /></FormControl><FormMessage /></FormItem>
                                            )}/>
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField control={form.control} name="zipCode" render={({ field }) => (
                                                    <FormItem><FormLabel>Postal Code</FormLabel><FormControl><Input placeholder="12345" {...field} /></FormControl><FormMessage /></FormItem>
                                                )}/>
                                                <FormField control={form.control} name="city" render={({ field }) => (
                                                    <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Anytown" {...field} /></FormControl><FormMessage /></FormItem>
                                                )}/>
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
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel>Subscribe to newsletter</FormLabel>
                                                <FormDescription>
                                                    Receive updates and special offers from us.
                                                </FormDescription>
                                            </div>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </section>
                            
                            <section>
                                <h2 className="text-2xl font-bold mb-4">Discount Code</h2>
                                {appliedDiscount ? (
                                    <div className="flex justify-between items-center text-green-600">
                                        <div className="flex items-center gap-2">
                                            <Tag className="h-4 w-4" />
                                            <span>Discount Applied: <span className="font-mono">{appliedDiscount.code}</span></span>
                                        </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleRemoveDiscount}><X className="h-4 w-4"/></Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Input placeholder="Enter discount code" className="h-9" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} />
                                        <Button type="button" variant="outline" onClick={handleApplyDiscount} disabled={isPending || !discountCode}>
                                            {isPending ? <Loader2 className="animate-spin" /> : 'Apply'}
                                        </Button>
                                    </div>
                                )}
                            </section>

                            {/* --- Mobile Order Summary --- */}
                            <div className="lg:hidden">
                                <Accordion type="single" collapsible defaultValue={'item-1'} className="w-full">
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
                        </div>
                        
                        {/* --- Desktop Order Summary --- */}
                        <div className="hidden lg:block">
                            <div className="flex flex-col sticky top-6 h-[calc(100vh-3rem)]">
                                <Card className="flex flex-col flex-1">
                                    <CardHeader>
                                        <CardTitle>Order Summary</CardTitle>
                                        <CardDescription>Review the items in your cart.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1 overflow-y-auto pr-4">
                                        <OrderSummaryContent />
                                    </CardContent>
                                </Card>
                                <div className="p-4 bg-background border border-t-0 rounded-b-lg">
                                    <AcceptTermsAndCompleteOrder />
                                </div>
                            </div>
                        </div>
                    </div>
                
                    {/* Sticky Footer for Mobile */}
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
        </>
    )
}

export function CheckoutClient({ location }: CheckoutClientProps) {
  const [stripePromise, setStripePromise] = React.useState<ReturnType<typeof loadStripe> | null>(null);

  React.useEffect(() => {
    getActiveStripeKey().then(key => {
      if (key) {
        setStripePromise(loadStripe(key));
      }
    });
  }, []);

  if (!stripePromise) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-8 w-8" /></div>;
  }
  
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm location={location} />
    </Elements>
  );
}
