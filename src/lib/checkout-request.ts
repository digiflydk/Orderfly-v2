import type { createStripeCheckoutSessionAction } from '@/app/checkout/actions';

// Bypass Next's client Server Action queue. Keep the same random attempt key and
// body across transport retries so they cannot create another order/session.
export async function requestHostedCheckout(...args: Parameters<typeof createStripeCheckoutSessionAction>): Promise<Awaited<ReturnType<typeof createStripeCheckoutSessionAction>>> {
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const body = JSON.stringify(args);
  const deadline = Date.now() + 60000;
  let networkFailures = 0;
  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(20000, deadline - Date.now())));
    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        credentials: 'same-origin', cache: 'no-store', body, signal: controller.signal,
      });
      const result = await response.json();
      if (typeof result?.success !== 'boolean' || (!response.ok && result.success)) throw new Error('Unconfirmed checkout response');
      if (!result.pending) return result;
      if (Date.now() >= deadline) throw new Error('Checkout still pending');
    } catch (error) {
      if (++networkFailures > 2 || Date.now() >= deadline) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
