import { withUpsellReads } from '@/lib/server/upsell-request-cache';
import { discountedUnit } from '@/lib/money';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import { upsellSales } from '@/lib/server/upsell-sales';
import { upsellBadges } from '@/lib/upsell-badges';
import { z } from 'zod';
import { getActiveUpsellForCart } from '@/app/superadmin/upsells/actions';
import { getOrigin } from '@/lib/url';
import { getAdminDb } from '@/lib/firebase-admin';
const id = z.string().min(1).max(160).regex(/^[^/\\?#]+$/);
const schema = z.object({ brandId: id, locationId: id, deliveryType: z.enum(['pickup', 'delivery']),
    previousUpsellId: id.optional(),
    cartItems: z.array(z.object({ id, upsellId:id.optional(), categoryId: id.optional(), itemType: z.enum(['product', 'combo']).optional(), tags: z.array(z.string().max(50)).max(10).optional(), includedProductIds: z.array(id).max(40).optional(), toppingIds: z.array(id).max(50).optional(), quantity: z.number().int().min(1).max(999).optional(), totalPrice: z.number().finite().nonnegative().max(1000000).optional(), comboSelections: z.array(z.object({groupId:id.optional(), groupName:z.string().max(200), products:z.array(z.object({id})).max(40)})).max(20).optional() })).max(100),
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
        return await withUpsellReads(async () => {
        const offer = await getActiveUpsellForCart(input.data);
        // Return only display terms and native product IDs; never expose admin
        // conditions, counters or internal records through a public endpoint.
        const sales = offer?.upsell.automaticBadges === false ? {} : offer ? await optionalCheckoutValue(()=>upsellSales(input.data.brandId,input.data.locationId),{} as Record<string,number>,750) : {};
        const serialize = (offer: Awaited<ReturnType<typeof getActiveUpsellForCart>>, step: number) => offer ? { upsell: { id: offer.upsell.id, upsellName: offer.upsell.upsellName, displayHeading: offer.upsell.displayHeading ?? offer.upsell.upsellName, description: offer.upsell.description ?? null, discountType: offer.upsell.discountType, ...(offer.upsell.discountValue !== undefined ? { discountValue: offer.upsell.discountValue } : {}) }, controlPercent: offer.upsell.controlPercent ?? 0, badges: upsellBadges(offer.products.map(p=>p.id),offer.upsell.automaticBadges === false ? {} : sales,offer.upsell.badgeOverrides), badgeSources:Object.fromEntries(offer.products.map(p=>[p.id,offer.upsell.badgeOverrides?.[p.id]?'manual':upsellBadges(offer.products.map(p=>p.id),offer.upsell.automaticBadges === false ? {} : sales,offer.upsell.badgeOverrides)[p.id]==='none'?'none':'auto'])), step, products: offer.products.map(product => ({ id: product.id })) } : null;
        const publicOffer = serialize(offer, input.data.previousUpsellId ? 2 : 1);
        if (publicOffer && offer && !input.data.previousUpsellId) {
            // Prepare simple one-click branches using native prices. Shared catalog,
            // campaigns and discounts are read once, never once per product.
            const followups: Record<string, ReturnType<typeof serialize>> = {};
            for (const product of offer.products) {
                if (product.toppingGroupIds?.length) continue;
                const base = input.data.deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price;
                const child = await getActiveUpsellForCart({...input.data,
                    previousUpsellId: offer.upsell.id,
                    excludedUpsellIds: [...(input.data.excludedUpsellIds || []), offer.upsell.id],
                    cartItems: [...input.data.cartItems, {id: product.id, itemType: 'product', quantity: 1,
                        upsellId: offer.upsell.id, totalPrice: discountedUnit(base, offer.upsell.discountType, offer.upsell.discountValue)}],
                });
                followups[product.id] = serialize(child, 2);
            }
            Object.assign(publicOffer, {followups});
        }
        return Response.json(publicOffer, { headers: { 'Cache-Control': 'no-store' } });
        });
    }
    catch {
        return Response.json(null, { status: 503 });
    }
}
