
'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { format as formatDate, toZonedTime } from 'date-fns-tz';

import type { Brand, Location, OrderDetail, PaymentDetails } from "@/types";
import { useCart } from '@/context/cart-context';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, User, Mail, Home, ShoppingCart, Truck, CreditCard, Hash, Clock, Tag, MessageSquare, AlertTriangle } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import type { GuestReceipt } from '@/lib/server/guest-receipt';

function InfoItem({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
    return (
        <div className="flex items-start">
            <Icon className="w-4 h-4 mr-3 mt-1 text-muted-foreground" />
            <div className="flex-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <div className="font-medium">{children}</div>
            </div>
        </div>
    )
}

function formatDisplayTime(timeString: string): string {
    if (!timeString) return '';
    const timeMatch = timeString.match(/(\d{2}:\d{2})/);
    if (timeMatch) return timeMatch[0];
    const durationMatch = timeString.match(/(\(\d+-\d+\s*min\))/);
    if (durationMatch) return durationMatch[0];
    return timeString;
}

interface ConfirmationClientProps {
    order: GuestReceipt | null;
    sessionId?: string;
    receiptToken?: string;
    orderId?: string;
    brand: Brand | null;
    location: Location | null;
}

// Helper to safely convert potentially stringified numbers from Firestore
const toNumber = (value: string | number | undefined | null): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const num = parseFloat(value);
        if (!isNaN(num)) return num;
    }
    return 0;
};


export function ConfirmationClient({ order: initialOrder, brand, location, sessionId, orderId, receiptToken }: ConfirmationClientProps) {
    const [order, setOrder] = useState(initialOrder);
    const [checking, setChecking] = useState(true);
    const [retry, setRetry] = useState(0);
    useEffect(() => { setOrder(initialOrder); }, [initialOrder]);
    useEffect(() => {
        if (!sessionId || !brand || !location || (order && order.paymentStatus !== 'Pending')) { setChecking(false); return; }
        let stopped = false, attempts = 0;
        let timer: ReturnType<typeof setTimeout>;
        const controller = new AbortController();
        const deadline = setTimeout(() => { stopped = true; controller.abort(); clearTimeout(timer); setChecking(false); }, 45000);
        setChecking(true);
        const poll = async () => {
            try {
                const query = new URLSearchParams({ session_id: sessionId, brand_id: brand.id, location_id: location.id });
                if (orderId) query.set('order_id', orderId);
                if (receiptToken) query.set('receipt_token', receiptToken);
                const response = await fetch(`/api/orders/lookup-by-session?${query}`, { cache: 'no-store', signal: controller.signal });
                const result = await response.json();
                if (stopped) return;
                if (response.ok && result.found && result.order) {
                    setOrder(result.order);
                    if (result.order.paymentStatus !== 'Pending') { setChecking(false); return; }
                }
            } catch { /* Temporary read failure is not a failed payment. */ }
            if (!stopped && ++attempts < 10) timer = setTimeout(poll, 3000);
            else if (!stopped) setChecking(false);
        };
        timer = setTimeout(poll, 1500);
        return () => { stopped = true; controller.abort(); clearTimeout(timer); clearTimeout(deadline); };
    }, [sessionId, receiptToken, orderId, brand?.id, location?.id, order?.paymentStatus, retry]);
    const { completeCheckout } = useCart();

    useEffect(() => {
        if (order?.paymentStatus === 'Paid' && brand && location) {
            completeCheckout(order.id, brand.id, location.id);
        }
    }, [order, brand, location, completeCheckout]);

    if (!order || !brand || !location) {
        return (
            <div className="flex min-h-screen flex-col">
                <main className="flex-1 flex items-center justify-center p-4">
                    <Card className="w-full max-w-lg text-center">
                        <CardHeader>
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                               <AlertTriangle className="h-8 w-8 text-yellow-600" />
                            </div>
                            <CardTitle className="mt-4 text-2xl">{checking && sessionId ? 'Checking payment' : 'Order details unavailable'}</CardTitle>
                            <CardDescription>
                                We couldn't find the details for your order. It might still be processing. Please contact the restaurant before making another payment if you have already paid.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Button variant="outline" disabled={checking || !sessionId} onClick={() => setRetry(value => value + 1)}>Check payment status</Button>
                             <Button asChild className="mt-6">
                                <Link href={`/`}>Back to Home</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </main>
            </div>
        )
    }
    
    if (order.paymentStatus !== 'Paid') {
        const failed = order.paymentStatus === 'Failed';
        return <main className="mx-auto max-w-lg p-8 text-center" aria-live="polite">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-600" />
            <h1 className="text-2xl font-bold">{failed ? 'Payment not completed' : 'Awaiting payment confirmation'}</h1>
            <p className="my-4">{failed ? 'This payment session has ended without payment.' :
              checking ? 'We are checking your payment. Please keep this page open.' :
              'Payment has not been confirmed yet. Check the status again or contact the restaurant before paying again.'}</p>
            <p className="mb-4">Order reference: {order.id}</p>
            {!failed && <Button disabled={checking} onClick={() => setRetry(value => value + 1)}>Check payment status</Button>}
            <Button asChild variant="outline" className="ml-2"><Link href={`/${brand.slug}/${location.slug}`}>Back to Menu</Link></Button>
        </main>;
    }

    const {
        id, createdAt, customerName, customerContact,
        deliveryType, status, productItems, paymentDetails, customerDetails, deliveryTime,
    } = order;

    // Normalize payment details to ensure they are numbers for safe calculation and formatting
    const subtotal = toNumber(paymentDetails.subtotal);
    const itemDiscountTotal = toNumber(paymentDetails.itemDiscountTotal);
    const cartDiscountTotal = toNumber(paymentDetails.cartDiscountTotal);
    const deliveryFee = toNumber(paymentDetails.deliveryFee);
    const bagFee = toNumber(paymentDetails.bagFee);
    const adminFee = toNumber(paymentDetails.adminFee);
    const vatAmount = toNumber(paymentDetails.vatAmount);
    const totalAmount = toNumber(order.totalAmount);


    // Convert the ISO string back to a Date object and specify the timezone for formatting
    const zonedDate = toZonedTime(new Date(createdAt), 'Europe/Copenhagen');
    const formattedCreatedAt = formatDate(zonedDate, 'MMMM d, yyyy HH:mm', { timeZone: 'Europe/Copenhagen' });

    const fullAddress = customerDetails.address;

    return (
        <div className="min-h-screen w-full bg-background">
            <main className="flex-1 py-12 px-4">
                <div className="w-full max-w-3xl mx-auto space-y-8">
                     <div className="text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                           <CheckCircle2 className="h-10 w-10 text-green-600" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Thank you for your order!</h1>
                        <p className="text-muted-foreground mt-2">
                           Your order <span className="font-mono text-foreground bg-muted p-1 rounded-sm">{id}</span> has been confirmed.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <Card>
                             <CardHeader><CardTitle>Customer Information</CardTitle></CardHeader>
                             <CardContent className="space-y-4">
                                <InfoItem icon={User} label="Name">{customerName}</InfoItem>
                                <InfoItem icon={Mail} label="Email">{customerContact}</InfoItem>
                                {deliveryType === 'Delivery' && (
                                     <InfoItem icon={Home} label="Delivery Address">{fullAddress}</InfoItem>
                                )}
                             </CardContent>
                        </Card>
                         <Card>
                             <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
                             <CardContent className="space-y-4">
                                <InfoItem icon={deliveryType === 'Delivery' ? Truck : ShoppingCart} label="Order Type">{deliveryType}</InfoItem>
                                {deliveryTime && (
                                    <InfoItem icon={Clock} label={deliveryType === 'Delivery' ? "Expected Delivery" : "Expected Pickup"}>
                                        {formatDisplayTime(deliveryTime)}
                                    </InfoItem>
                                )}
                                <InfoItem icon={Hash} label="Order Status"><Badge>{status}</Badge></InfoItem>
                                <InfoItem icon={CreditCard} label="Payment Method">Card Payment</InfoItem>
                             </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Order Summary</CardTitle>
                            <CardDescription>
                                Order placed on {formattedCreatedAt}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {productItems.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <p className="font-medium">{item.name}</p>
                                                {item.toppings && item.toppings.length > 0 && <p className="text-xs text-muted-foreground">{item.toppings.join(', ')}</p>}
                                                {item.comboSelections?.map(group => <p key={group.groupId || group.groupName} className="text-xs text-muted-foreground">{group.groupName}: {group.products.map(product => product.name).join(', ')}</p>)}
                                            </TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell className="text-right">kr. {toNumber(item.totalPrice).toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Separator className="my-4" />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>kr. {subtotal.toFixed(2)}</span>
                                </div>
                                {itemDiscountTotal > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground flex items-center gap-1"><Tag className="h-4 w-4"/>Product Discounts</span>
                                        <span>- kr. {itemDiscountTotal.toFixed(2)}</span>
                                    </div>
                                )}
                                {cartDiscountTotal > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground flex items-center gap-1"><Tag className="h-4 w-4"/>{paymentDetails.cartDiscountName || 'Cart Discount'}</span>
                                        <span>- kr. {cartDiscountTotal.toFixed(2)}</span>
                                    </div>
                                )}
                                {deliveryType === 'Delivery' && deliveryFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Delivery Fee</span>
                                        <span>kr. {deliveryFee.toFixed(2)}</span>
                                    </div>
                                )}
                                 {deliveryType === 'Delivery' && deliveryFee === 0 && (itemDiscountTotal > 0 || cartDiscountTotal > 0) && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground">Delivery Fee</span>
                                        <span>Free</span>
                                    </div>
                                )}
                                {bagFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Bag Fee</span>
                                        <span>kr. {bagFee.toFixed(2)}</span>
                                    </div>
                                )}
                                {adminFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Admin Fee</span>
                                        <span>kr. {adminFee.toFixed(2)}</span>
                                    </div>
                                )}
                                 <Separator className="my-2" />
                                <div className="flex justify-between font-bold text-base">
                                    <span>Total</span>
                                    <span>kr. {totalAmount.toFixed(2)}</span>
                                </div>
                                {vatAmount > 0 && (
                                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                                    <span>VAT Included</span>
                                    <span>kr. {vatAmount.toFixed(2)}</span>
                                </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="text-center space-x-4">
                         <Button asChild variant="outline">
                            <Link href={`/feedback?orderId=${order.id}&customerId=${order.customerDetails.id}`}>Give Feedback</Link>
                        </Button>
                        <Button asChild>
                            <Link href={`/${brand.slug}/${location.slug}`}>Continue Shopping</Link>
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    )
}
