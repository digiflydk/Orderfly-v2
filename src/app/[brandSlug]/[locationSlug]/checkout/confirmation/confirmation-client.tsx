
'use client';

import { useEffect, useState } from 'react';
import Link from "next/link";
import { formatPrice, localizeTime } from '@/lib/storefront-format';

import type { Brand, Location, OrderDetail, PaymentDetails } from "@/types";
import { useCart } from '@/context/cart-context';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, User, Mail, Home, ShoppingCart, Truck, CreditCard, Hash, Clock, Tag, MessageSquare, AlertTriangle } from "lucide-react";
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

import type { GuestReceipt } from '@/lib/server/guest-receipt';
import { pushPaidPurchase } from '@/lib/analytics';

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
    return localizeTime(timeString);
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
            const sendPurchase = () => pushPaidPurchase({
                orderId: order.id, value: order.totalAmount, brandId: brand.id, locationId: location.id, currency: order.invoice?.currency || brand.currency || 'DKK',
                ...(!brand.gtmContainerId && brand.googleAdsConversionId && brand.googleAdsPurchaseLabel
                    ? { googleAdsSendTo: `${brand.googleAdsConversionId}/${brand.googleAdsPurchaseLabel}` } : {}),
                items: order.productItems.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice })),
            });
            sendPurchase();
            window.addEventListener('orderfly:tracking-ready', sendPurchase);
            window.addEventListener('orderfly:consent', sendPurchase);
            return () => { window.removeEventListener('orderfly:tracking-ready', sendPurchase); window.removeEventListener('orderfly:consent', sendPurchase); };
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
                            <CardTitle className="mt-4 text-2xl">{checking && sessionId ? 'Kontrollerer betaling' : 'Ordreoplysninger er ikke tilgængelige'}</CardTitle>
                            <CardDescription>
                                Vi kunne ikke finde din ordre endnu. Betalingen kan stadig være under behandling. Kontakt restauranten, før du betaler igen, hvis beløbet allerede er trukket.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Button variant="outline" disabled={checking || !sessionId} onClick={() => setRetry(value => value + 1)}>Kontrollér betalingsstatus</Button>
                             <Button asChild className="mt-6">
                                <Link href={brand && location ? `/${brand.slug}/${location.slug}` : brand ? `/${brand.slug}` : `/`}>Tilbage til menuen</Link>
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
            <h1 className="text-2xl font-bold">{failed ? 'Betalingen blev ikke gennemført' : 'Afventer bekræftelse af betaling'}</h1>
            <p className="my-4">{failed ? 'Betalingsvinduet er lukket uden betaling.' :
              checking ? 'Vi kontrollerer din betaling. Behold siden åben.' :
              'Betalingen er endnu ikke bekræftet. Kontrollér status igen, eller kontakt restauranten, før du betaler igen.'}</p>
            <p className="mb-4">Ordrenummer: {order.id}</p>
            {!failed && <Button disabled={checking} onClick={() => setRetry(value => value + 1)}>Kontrollér betalingsstatus</Button>}
            <Button asChild variant="outline" className="ml-2"><Link href={`/${brand.slug}/${location.slug}`}>Tilbage til menuen</Link></Button>
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
    const formattedCreatedAt = new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(createdAt));

    const fullAddress = customerDetails.address;

    return (
        <div className="min-h-screen w-full bg-background">
            <main className="flex-1 py-12 px-4">
                <div className="w-full max-w-3xl mx-auto space-y-8">
                     <div className="text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                           <CheckCircle2 className="h-10 w-10 text-green-600" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Tak for din bestilling!</h1>
                        <p className="text-muted-foreground mt-2">
                           Din ordre <span className="font-mono text-foreground bg-muted p-1 rounded-sm">{id}</span> er bekræftet.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <Card>
                             <CardHeader><CardTitle>Kundeoplysninger</CardTitle></CardHeader>
                             <CardContent className="space-y-4">
                                <InfoItem icon={User} label="Navn">{customerName}</InfoItem>
                                <InfoItem icon={Mail} label="E-mail">{customerContact}</InfoItem>
                                {deliveryType === 'Delivery' && (
                                     <InfoItem icon={Home} label="Leveringsadresse">{fullAddress}</InfoItem>
                                )}
                             </CardContent>
                        </Card>
                         <Card>
                             <CardHeader><CardTitle>Ordreoplysninger</CardTitle></CardHeader>
                             <CardContent className="space-y-4">
                                <InfoItem icon={deliveryType === 'Delivery' ? Truck : ShoppingCart} label="Bestillingstype">{deliveryType === 'Delivery' ? 'Levering' : 'Afhentning'}</InfoItem>
                                {deliveryTime && (
                                    <InfoItem icon={Clock} label={deliveryType === 'Delivery' ? "Forventet levering" : "Forventet afhentning"}>
                                        {formatDisplayTime(deliveryTime)}
                                    </InfoItem>
                                )}
                                <InfoItem icon={Hash} label="Ordrestatus"><Badge>{{Received:'Modtaget','In Progress':'Tilberedes',Ready:'Klar',Completed:'Afsluttet',Delivered:'Leveret',Canceled:'Annulleret',Error:'Kontakt restauranten'}[status] || 'Modtaget'}</Badge></InfoItem>
                                <InfoItem icon={CreditCard} label="Betalingsmetode">Kortbetaling</InfoItem>
                             </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Din faktura</CardTitle>
                            <CardDescription>
                                {order.invoice ? `Faktura ${order.invoice.number} · ` : ''}Bestilt den {formattedCreatedAt}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                           <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vare</TableHead>
                                        <TableHead>Antal</TableHead>
                                        <TableHead className="text-right">I alt</TableHead>
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
                                            <TableCell className="text-right">{formatPrice(toNumber(item.totalPrice))}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Separator className="my-4" />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Varesubtotal</span>
                                    <span>{formatPrice(subtotal)}</span>
                                </div>
                                {itemDiscountTotal > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground flex items-center gap-1"><Tag className="h-4 w-4"/>Varerabatter</span>
                                        <span>- {formatPrice(itemDiscountTotal)}</span>
                                    </div>
                                )}
                                {cartDiscountTotal > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground flex items-center gap-1"><Tag className="h-4 w-4"/>{paymentDetails.cartDiscountName || 'Kurvrabat'}</span>
                                        <span>- {formatPrice(cartDiscountTotal)}</span>
                                    </div>
                                )}
                                {deliveryType === 'Delivery' && deliveryFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Levering</span>
                                        <span>{formatPrice(deliveryFee)}</span>
                                    </div>
                                )}
                                 {deliveryType === 'Delivery' && deliveryFee === 0 && (itemDiscountTotal > 0 || cartDiscountTotal > 0) && (
                                    <div className="flex justify-between text-green-600">
                                        <span className="text-muted-foreground">Levering</span>
                                        <span>Gratis</span>
                                    </div>
                                )}
                                {bagFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Pose</span>
                                        <span>{formatPrice(bagFee)}</span>
                                    </div>
                                )}
                                {adminFee > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Administrationsgebyr</span>
                                        <span>{formatPrice(adminFee)}</span>
                                    </div>
                                )}
                                 <Separator className="my-2" />
                                <div className="flex justify-between font-bold text-base">
                                    <span>I alt</span>
                                    <span>{formatPrice(totalAmount)}</span>
                                </div>
                                {vatAmount > 0 && (
                                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                                    <span>Heraf moms</span>
                                    <span>{formatPrice(vatAmount)}</span>
                                </div>
                                )}
                                {order.invoice && <div className="mt-5 border-t pt-4 text-xs text-muted-foreground">
                                    <p className="font-medium text-foreground">{order.invoice.seller.legalName} · CVR {order.invoice.seller.registrationNumber}</p>
                                    <p>{order.invoice.seller.address}</p>
                                    <p>Fakturadato: {new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(order.invoice.issuedAt))}</p>
                                </div>}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="text-center space-x-4">
                         <Button asChild variant="outline">
                            <Link href={`/feedback?orderId=${order.id}&customerId=${order.customerDetails.id}`}>Giv feedback</Link>
                        </Button>
                        <Button asChild>
                            <Link href={`/${brand.slug}/${location.slug}`}>Tilbage til menuen</Link>
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    )
}
