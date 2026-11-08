'use server';
import { listScopedDocuments } from '@/lib/access/scoped-data';
import { analyticsDateRange } from '@/lib/analytics/date-range';
import { upsellReport } from '@/lib/upsell-report';
export async function getUpsellReport(input: {
    from: string;
    to: string;
    brand?: string;
    location?: string;
    campaign?: string;
    product?: string;
    step?: number;
}) {
    const { start, endExclusive } = analyticsDateRange(input.from, input.to);
    if (endExclusive.getTime() - start.getTime() > 93 * 86400000)
        throw Error('Vælg højst 93 dage.');
    const scoped: Array<[
        string,
        any,
        any
    ]> = [];
    if (input.brand)
        scoped.push(['brandId', '==', input.brand]);
    if (input.location)
        scoped.push(['locationId', '==', input.location]);
    const [events, orders] = await Promise.all([
        listScopedDocuments('analytics_events', 'orderfly.analytics:view', 'location', [...scoped, ['ts', '>=', start], ['ts', '<', endExclusive]]),
        listScopedDocuments('orders', 'orderfly.analytics:view', 'location', [...scoped, ['paidAt', '>=', start], ['paidAt', '<', endExclusive]]),
    ]);
    return upsellReport(events.map(r => r.data()), orders.map(r => r.data()), input);
}
