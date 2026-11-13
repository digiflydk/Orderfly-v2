
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cancelCheckout } from '@/app/checkout/cancel-actions';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useParams } from "next/navigation";
import { useStorefrontPath } from "@/hooks/use-storefront-path";


function CancelMessage() {
    const searchParams = useSearchParams();
    const params = useParams();
    const orderId = searchParams.get('order_id');
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'loading' | 'canceled' | 'paid' | 'pending' | 'error'>('loading');
    const [supportCode, setSupportCode] = useState<string | undefined>();
    const apply = (result: Awaited<ReturnType<typeof cancelCheckout>>) => {
        setStatus(result.status);
        setSupportCode(typeof result.code === 'string' && /^WORLDLINE_CANCEL_[A-Z0-9_]{1,96}$/.test(result.code) ? result.code : undefined);
    };
    useEffect(() => {
        if (!orderId || !token) { setStatus('error'); return; }
        let stopped = false;
        void cancelCheckout(orderId, token).then(result => { if (!stopped) apply(result); }).catch(() => { if (!stopped) setStatus('error'); });
        return () => { stopped = true; };
    }, [orderId, token]);
    const brandSlug = params.brandSlug as string;
    const locationSlug = params.locationSlug as string;
    const checkoutPath = useStorefrontPath(brandSlug)(locationSlug, 'checkout');

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                   {status === 'loading' || status === 'pending' ? <Clock className="h-8 w-8 text-amber-600" /> : status === 'paid' ? <CheckCircle2 className="h-8 w-8 text-green-600" /> : <XCircle className="h-8 w-8 text-red-600" />}
                </div>
                <CardTitle className="mt-4 text-2xl">
                    {status === 'loading' ? 'Annullerer betaling…' : status === 'canceled' ? 'Betalingen er annulleret' : status === 'paid' ? 'Betalingen er gennemført' : status === 'pending' ? 'Annulleringen afventer bekræftelse' : 'Annulleringen kunne ikke bekræftes'}
                </CardTitle>
                <CardDescription>
                    {status === 'loading' ? 'Vent, mens vi bekræfter hos betalingsudbyderen.' : status === 'canceled' ? 'Betalingssiden er lukket. Din kurv er gemt. Gå tilbage til kassen for at gennemgå priser og tider. Indtast eventuelt rabatkoden igen.' : status === 'paid' ? 'Din betaling er gennemført. Betal ikke igen.' : 'pending' === status ? 'Vi har endnu ikke bekræftet, om betalingssiden er lukket. Betal ikke igen. Kontrollér annulleringen igen, eller kontakt restauranten.' : 'Vi kunne ikke bekræfte annulleringen. Betal ikke igen, før status er afklaret.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {supportCode && <p className="mb-4 text-sm text-muted-foreground">Fejlkode: {supportCode}</p>}
                {(status === 'error' || status === 'pending') && !!orderId && !!token && <Button onClick={() => { setStatus('loading'); setSupportCode(undefined); void cancelCheckout(orderId, token).then(apply).catch(() => setStatus('error')); }}>{status === 'pending' ? 'Kontrollér annulleringen' : 'Prøv at annullere igen'}</Button>}
                {status === 'canceled' && <Button asChild className="mt-6">
                    <Link href={checkoutPath}>Tilbage til kassen</Link>
                </Button>}
            </CardContent>
        </Card>
    );
}

export default function CheckoutCancelPage() {
    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1 flex items-center justify-center p-4">
                <Suspense fallback={<p>Indlæser…</p>}>
                    <CancelMessage />
                </Suspense>
            </main>
        </div>
    )
}
