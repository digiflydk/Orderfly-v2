'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getM3PizzaMenuHref,
  normalizeM3PizzaDeliveryMethod,
  persistM3PizzaDeliveryMethod,
} from '@/lib/m3pizza-order-flow';

export default function M3PizzaLegacyOrderRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const requestedMethod = new URLSearchParams(window.location.search).get(
      'deliveryMethod',
    );
    const deliveryMethod = normalizeM3PizzaDeliveryMethod(requestedMethod);

    persistM3PizzaDeliveryMethod(deliveryMethod);
    router.replace(getM3PizzaMenuHref(deliveryMethod));
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-m3-cream px-4 text-center">
      <p className="text-sm text-m3-dark">Åbner menukortet…</p>
    </main>
  );
}
