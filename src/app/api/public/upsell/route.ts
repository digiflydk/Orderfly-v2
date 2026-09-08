import { z } from 'zod';
import { getActiveUpsellForCart } from '@/app/superadmin/upsells/actions';
import { getOrigin } from '@/lib/url';
import { getAdminDb } from '@/lib/firebase-admin';
const id = z.string().min(1).max(160).regex(/^[^/\\?#]+$/);
const schema = z.object({ brandId: id, locationId: id, deliveryType: z.enum(['pickup', 'delivery']),
    cartItems: z.array(z.object({ id, categoryId: id.optional(), itemType: z.enum(['product', 'combo']).optional(), tags: z.array(z.string().max(50)).max(10).optional(), includedProductIds: z.array(id).max(40).optional() })).max(100),
    cartTotal: z.number().finite().nonnegative().max(1000000), excludedUpsellIds: z.array(id).max(100).optional() });
export const runtime = 'nodejs';
export async function POST(request: Request) {
    if (request.headers.get('origin') !== await getOrigin())
        return Response.json(null, { status: 403 });
    const reader = request.body?.getReader();
    if (!reader)
        return Response.json(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            length += value.byteLength;
            if (length > 24000) {
                await reader.cancel();
                return Response.json(null, { status: 413 });
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
        body = JSON.parse(raw);
    }
    catch {
        return Response.json(null, { status: 400 });
    }
    const input = schema.safeParse(body);
    if (!input.success)
        return Response.json(null, { status: 400 });
    try {
        const location = await getAdminDb().collection('locations').doc(input.data.locationId).get();
        if (!location.exists || location.data()?.brandId !== input.data.brandId || !location.data()?.isActive || !location.data()?.deliveryTypes?.includes(input.data.deliveryType))
            return Response.json(null, { status: 404 });
        const offer = await getActiveUpsellForCart(input.data);
        // Return only display terms and native product IDs; never expose admin
        // conditions, counters or internal records through a public endpoint.
        const publicOffer = offer ? { upsell: { id: offer.upsell.id, upsellName: offer.upsell.upsellName, discountType: offer.upsell.discountType, ...(offer.upsell.discountValue !== undefined ? { discountValue: offer.upsell.discountValue } : {}) }, products: offer.products.slice(0, 30).map(product => ({ id: product.id })) } : null;
        return Response.json(publicOffer, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json(null, { status: 503 });
    }
}
