
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import Link from "next/link";
import { cancelCheckout } from '@/app/checkout/cancel-actions';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useParams } from "next/navigation";


function CancelMessage() {
    const searchParams = useSearchParams();
    const params = useParams();
    const orderId = searchParams.get('order_id');
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'loading' | 'canceled' | 'paid' | 'error'>('loading');
    useEffect(() => {
        if (!orderId || !token) { setStatus('error'); return; }
        void cancelCheckout(orderId, token).then(result => setStatus(result.status)).catch(() => setStatus('error'));
    }, [orderId, token]);
    const brandSlug = params.brandSlug as string;
    const locationSlug = params.locationSlug as string;

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                   <XCircle className="h-8 w-8 text-red-600" />
                </div>
                <CardTitle className="mt-4 text-2xl">
                    {status === 'loading' ? 'Annullerer betaling…' : status === 'canceled' ? 'Betalingen er annulleret' : status === 'paid' ? 'Betalingen er gennemført' : 'Annulleringen kunne ikke bekræftes'}
                </CardTitle>
                <CardDescription>
                    {status === 'loading' ? 'Vent, mens vi bekræfter hos betalingsudbyderen.' : status === 'canceled' ? 'Betalingssiden er lukket. Din kurv er gemt. Gå tilbage til kassen for at gennemgå priser og tider. Indtast eventuelt rabatkoden igen.' : status === 'paid' ? 'Din betaling er gennemført. Betal ikke igen.' : 'Vi kunne ikke bekræfte annulleringen. Prøv igen.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {status === 'error' && <Button onClick={() => { setStatus('loading'); void cancelCheckout(orderId || '', token || '').then(r => setStatus(r.status)).catch(() => setStatus('error')); }}>Prøv at annullere igen</Button>}
                {status === 'canceled' && <Button asChild className="mt-6">
                    <Link href={`/${brandSlug}/${locationSlug}/checkout`}>Tilbage til kassen</Link>
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
