import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getActiveStripeSecretKey } from '@/app/superadmin/settings/actions';
import { settlePaidCheckoutSession } from '@/lib/server/settle-checkout';
import { z } from 'zod';

const input = z.object({
  orderId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  sessionId: z.string().regex(/^cs_(test_|live_)?[A-Za-z0-9_]{8,250}$/),
}).strict();
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: NextRequest) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: 'invalid_params' }, 400);
  const { orderId, sessionId } = parsed.data;
  try {
    const stripeKey = await getActiveStripeSecretKey();
    if (!stripeKey) throw new Error('Stripe unavailable');
    const stripe = new Stripe(stripeKey, { timeout: 5000, maxNetworkRetries: 0 });
    // The random session is the caller's capability. Do not expose whether an
    // unrelated predictable order ID exists, and never accept it as proof alone.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.id !== sessionId || session.metadata?.orderId !== orderId ||
        !session.metadata.brandId || !session.metadata.locationId) return reply({ ok: false, error: 'payment_scope_mismatch' }, 403);
    const snap = await getDoc(doc(db, 'orders', orderId));
    const order = snap.data();
    if (!snap.exists() || order?.psp?.checkoutSessionId !== sessionId ||
        order.brandId !== session.metadata.brandId || order.locationId !== session.metadata.locationId) return reply({ ok: false, error: 'payment_scope_mismatch' }, 403);
    // A complete checkout may still be awaiting an asynchronous payment.
    if (session.payment_status !== 'paid') return reply({ ok: true, status: 'Pending', orderId });
    await settlePaidCheckoutSession(session);
    return reply({ ok: true, status: 'Paid', orderId });
  } catch {
    return reply({ ok: false, error: 'server_error' }, 500);
  }
}
