'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { AnalyticsEvent, FunnelFilters, FunnelOutput } from '@/types';
import { getPurchasesInRange } from './sources/orders';
import { startOfDay, endOfDay } from 'date-fns';
import * as admin from 'firebase-admin';

const COL_EVENTS = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_EVENTS || 'analytics_events';
type StepKey = 'view_menu' | 'view_product' | 'add_to_cart' | 'start_checkout' | 'click_purchase';
const STEPS: StepKey[] = ['view_menu', 'view_product', 'add_to_cart', 'start_checkout', 'click_purchase'];

export async function getFunnelData(filters: FunnelFilters, _user?: unknown): Promise<FunnelOutput> {
  const dateFrom = startOfDay(new Date(filters.dateFrom));
  const dateTo = endOfDay(new Date(filters.dateTo));
  const db = getAdminDb();
  let query: admin.firestore.Query = db.collection(COL_EVENTS)
    .where('ts', '>=', admin.firestore.Timestamp.fromDate(dateFrom))
    .where('ts', '<=', admin.firestore.Timestamp.fromDate(dateTo));
  if (filters.brandId && filters.brandId !== 'all') query = query.where('brandId', '==', filters.brandId);
  if (filters.locationId && filters.locationId !== 'all') query = query.where('locationId', '==', filters.locationId);

  const [snapshot, purchases] = await Promise.all([
    query.get(),
    getPurchasesInRange({ startDate: dateFrom, endDate: dateTo, brandId: filters.brandId, locationId: filters.locationId, device: filters.device, utmSource: filters.utmSource }),
  ]);
  const events = snapshot.docs.map(doc => doc.data() as AnalyticsEvent).filter(event => {
    if (filters.device && filters.device !== 'all' && event.deviceType !== filters.device) return false;
    if (filters.utmSource && String((event as unknown as Record<string, unknown>).source || '').toLowerCase() !== filters.utmSource.toLowerCase()) return false;
    return true;
  });
  const sessions = new Set(events.map(event => event.sessionId).filter(Boolean));
  const unique = filters.counting === 'unique';
  const paidCount = unique
    ? new Set(purchases.flatMap(row => [...row.sessionIds])).size
    : purchases.reduce((sum, row) => sum + row.count, 0);
  const totals: FunnelOutput['totals'] = {
    sessions: sessions.size, view_menu: 0, view_product: 0, add_to_cart: 0, start_checkout: 0, click_purchase: 0,
    payment_succeeded: paidCount,
    payment_session_created: 0, upsell_offer_shown: 0, upsell_accepted: 0, upsell_rejected: 0,
    revenue_paid: purchases.reduce((sum, row) => sum + row.revenue, 0),
    delivery_fees_total: purchases.reduce((sum, row) => sum + row.deliveryFee, 0),
    discounts_total: purchases.reduce((sum, row) => sum + row.discount, 0),
  };
  for (const step of STEPS) totals[step] = unique
    ? new Set(events.filter(event => event.name === step).map(event => event.sessionId).filter(Boolean)).size
    : events.filter(event => event.name === step).length;
  for (const name of ['payment_session_created', 'upsell_offer_shown', 'upsell_accepted', 'upsell_rejected'] as const) {
    totals[name] = unique
      ? new Set(events.filter(event => event.name === name).map(event => event.sessionId).filter(Boolean)).size
      : events.filter(event => event.name === name).length;
  }

  const dates = new Map<string, { sessions: Set<string>; purchases: number; revenue: number }>();
  for (const event of events) {
    const raw = event.ts as unknown;
    const value = raw instanceof admin.firestore.Timestamp ? raw.toDate() : new Date(raw as string);
    if (!Number.isFinite(value.getTime())) continue;
    const key = value.toISOString().slice(0, 10), row = dates.get(key) || { sessions: new Set<string>(), purchases: 0, revenue: 0 };
    if (event.sessionId) row.sessions.add(event.sessionId); dates.set(key, row);
  }
  for (const row of purchases) {
    const key = row.date, day = dates.get(key) || { sessions: new Set<string>(), purchases: 0, revenue: 0 };
    row.sessionIds.forEach(id => day.sessions.add(id)); day.purchases += row.count; day.revenue += row.revenue; dates.set(key, day);
  }
  const daily = [...dates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => ({ date, sessions: row.sessions.size, purchases: row.purchases, revenue: row.revenue }));

  const locationIds = [...new Set([...events.map(event => event.locationId), ...purchases.map(row => row.locationId)].filter(Boolean))] as string[];
  const locationDocs = await Promise.all(locationIds.map(id => db.collection('locations').doc(id).get()));
  const locationNames = new Map(locationDocs.map(doc => [doc.id, String(doc.data()?.name || doc.id)]));
  const byLocation = locationIds.map(locationId => {
    const locationSessions = new Set(events.filter(event => event.locationId === locationId).map(event => event.sessionId).filter(Boolean));
    const rows = purchases.filter(row => row.locationId === locationId), purchaseCount = unique ? new Set(rows.flatMap(row => [...row.sessionIds])).size : rows.reduce((sum, row) => sum + row.count, 0), revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    return { locationId, locationName: locationNames.get(locationId) || locationId, sessions: locationSessions.size, purchases: purchaseCount, convSessionsToPurchase: locationSessions.size ? purchaseCount / locationSessions.size * 100 : 0, aov: purchaseCount ? revenue / purchaseCount : 0, revenue };
  });
  const channels = new Map<string, FunnelOutput['attribution'][number] & { sessionIds: Set<string> }>();
  for (const row of purchases) {
    const key = JSON.stringify([row.source, row.medium, row.campaign]);
    const value = channels.get(key) || { source: row.source, medium: row.medium, campaign: row.campaign, purchases: 0, revenue: 0, sessionIds: new Set<string>() };
    row.sessionIds.forEach(id => value.sessionIds.add(id));
    value.purchases = unique ? value.sessionIds.size : value.purchases + row.count;
    value.revenue += row.revenue; channels.set(key, value);
  }
  const attribution = [...channels.values()].map(({ sessionIds: _sessionIds, ...row }) => row).sort((a, b) => b.revenue - a.revenue);
  const sequence = [totals.view_menu, totals.view_product, totals.add_to_cart, totals.start_checkout, totals.click_purchase, totals.payment_succeeded];
  const dataQualityWarnings = sequence.some((value, index) => index > 0 && value > sequence[index - 1])
    ? ['Et senere funnel-trin har flere registreringer end det foregående. Kontroller samtykke, tag-konfiguration og den valgte periode.'] : [];
  return { totals, daily, byLocation, attribution, dataQualityWarnings };
}
