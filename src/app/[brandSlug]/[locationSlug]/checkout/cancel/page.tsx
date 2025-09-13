
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from 'react';
import { useSearchParams, useParams } from "next/navigation";


function CancelMessage() {
    const searchParams = useSearchParams();
    const params = useParams();
    const error = searchParams.get('error');
    const brandSlug = params.brandSlug as string;
    const locationSlug = params.locationSlug as string;

    return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                   <XCircle className="h-8 w-8 text-red-600" />
                </div>
                <CardTitle className="mt-4 text-2xl">Payment Canceled</CardTitle>
                <CardDescription>
                    {error 
                        ? 'An error occurred during the payment process. Please try again.'
                        : 'Your payment was canceled. Your cart has been saved if you want to try again.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button asChild className="mt-6">
                    <Link href={`/${brandSlug}/${locationSlug}/checkout`}>Return to Checkout</Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export default function CheckoutCancelPage() {
    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex-1 flex items-center justify-center p-4">
                <Suspense fallback={<p>Loading...</p>}>
                    <CancelMessage />
                </Suspense>
            </main>
        </div>
    )
}
