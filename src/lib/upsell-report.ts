import { isPaidSale, paidSaleAmount } from './paid-order';
type Row = Record<string, any>;
/** Aggregate consented exposures separately from authoritative paid order amounts. */
export function upsellReport(events: Row[], orders: Row[], filters: {
    campaign?: string;
    product?: string;
    step?: number;
} = {}) {
    const interactions = new Map<string, Set<string>>(), groups = new Map<string, string>(), eligibleAt = new Map<string, number>(), badgeExposures = new Map<string, string>(), badgeAccepts = new Set<string>();
    const timestamp = (value: any): number => value?.toMillis?.() ?? (value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : NaN);
    const matches = (r: Row) => (!filters.campaign || r.upsellId === filters.campaign) && (!filters.product || r.productId === filters.product) && (!filters.step || r.upsellStep === filters.step || r.step === filters.step);
    for (const e of events) {
        if (!e.sessionId || !e.brandId || !e.locationId)
            continue;
        const session = JSON.stringify([e.brandId, e.locationId, e.sessionId]);
        if (e.name === 'upsell_eligible' && (!filters.campaign || e.upsellId === filters.campaign) && ['control', 'treatment'].includes(e.experimentGroup)) {
            const at = timestamp(e.ts);
            if (Number.isFinite(at))
                eligibleAt.set(session, Math.min(eligibleAt.get(session) ?? Infinity, at));
            const prior = groups.get(session);
            groups.set(session, prior && prior !== e.experimentGroup ? 'mixed' : e.experimentGroup);
        }
        if (!matches(e))
            continue;
        if (e.interactionId && e.upsellId) {
            const key = JSON.stringify([session, e.upsellId, e.interactionId]);
            const row = interactions.get(key) || new Set<string>();
            row.add(e.name);
            interactions.set(key, row);
        }
        const productKey = JSON.stringify([session, e.upsellId, e.interactionId, e.productId]);
        if (e.name === 'upsell_product_shown' && e.productId && e.interactionId)
            badgeExposures.set(productKey, `${e.badgeSource || 'none'}:${e.badge || 'none'}`);
    }
    const cohorts = { control: { sessions: 0, purchases: 0, orders: 0, revenue: 0 }, treatment: { sessions: 0, purchases: 0, orders: 0, revenue: 0 } };
    for (const group of groups.values())
        if (group === 'control' || group === 'treatment')
            cohorts[group].sessions++;
    let paidOrders = 0, units = 0, revenue = 0, discount = 0, partialRefunds = 0;
    for (const e of events) {
        if (!['upsell_accepted', 'upsell_rejected'].includes(e.name) || !e.sessionId || !e.interactionId || !e.upsellId)
            continue;
        if (filters.product && e.name === 'upsell_accepted' && e.productId !== filters.product)
            continue;
        const session = JSON.stringify([e.brandId, e.locationId, e.sessionId]);
        const key = JSON.stringify([session, e.upsellId, e.interactionId]);
        interactions.get(key)?.add(e.name);
        if (e.name === 'upsell_accepted')
            badgeAccepts.add(JSON.stringify([session, e.upsellId, e.interactionId, e.productId]));
    }
    const purchased = { control: new Set<string>(), treatment: new Set<string>() };
    for (const order of orders) {
        if (!isPaidSale(order))
            continue;
        const session = JSON.stringify([order.brandId, order.locationId, order.analytics?.sessionId]);
        const group = groups.get(session);
        if ((group === 'control' || group === 'treatment') && timestamp(order.paidAt) >= (eligibleAt.get(session) ?? Infinity)) {
            purchased[group].add(session);
            cohorts[group].orders++;
            cohorts[group].revenue += paidSaleAmount(order);
        }
        const lines = (order.upsellMeasurement || []).filter((line: Row) => matches(line));
        if (!lines.length)
            continue;
        paidOrders++;
        const refunded = Math.max(0, Number(order.refundedAmountOre) || 0) / 100;
        if (refunded > 0)
            partialRefunds++;
        // Refunds without line allocation are explicitly estimated proportionally.
        const refundRatio = order.totalAmount > 0 ? paidSaleAmount(order) / order.totalAmount : 0;
        const merchandise = (order.productItems || []).reduce((sum: number, item: Row) => sum + (Number(item.totalPrice) || 0), 0);
        const cartDiscount = Math.max(0, Number(order.paymentDetails?.cartDiscountTotal) || 0);
        for (const line of lines) {
            const allocated = merchandise > 0 ? Math.min(line.amount, cartDiscount * line.amount / merchandise) : 0;
            units += line.quantity;
            revenue += (line.amount - allocated) * refundRatio;
            discount += line.itemDiscount + allocated;
        }
    }
    for (const group of ['control', 'treatment'] as const)
        cohorts[group].purchases = purchased[group].size;
    const shown = [...interactions.values()].filter(row => row.has(filters.product ? 'upsell_product_shown' : 'upsell_offer_shown'));
    const badges: Record<string, {
        views: number;
        accepted: number;
    }> = {};
    for (const [key, label] of badgeExposures) {
        const row = badges[label] ??= { views: 0, accepted: 0 };
        row.views++;
        if (badgeAccepts.has(key))
            row.accepted++;
    }
    return { offers: shown.length, accepted: shown.filter(r => r.has('upsell_accepted')).length, rejected: shown.filter(r => r.has('upsell_rejected')).length, paidOrders, units, revenue, discount, partialRefunds, cohorts, badges };
}
