
'use server';

import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import type { AnalyticsEvent, AnalyticsDaily } from '@/types';
import { analyticsDateKeys, analyticsDateRange } from '@/lib/analytics/date-range';
import { getPurchasesInRange } from './sources/orders';
import * as admin from 'firebase-admin';

const COL_EVENTS = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_EVENTS || 'analytics_events';
const COL_DAILY  = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_DAILY  || 'analytics_daily';

export async function aggregateDailyData(startISO: string, endISO: string) {
  await requirePlatformSuperuser();
  const days = analyticsDateKeys(startISO, endISO);
  const daysProcessedCount = days.length;

  let eventsProcessed = 0;
  let docsWritten = 0;

  for (const dateKey of days) {
    const { start: d0, endExclusive: d1 } = analyticsDateRange(dateKey, dateKey);

    const db = getAdminDb();
    const q = db.collection(COL_EVENTS)
      .where('ts', '>=', admin.firestore.Timestamp.fromDate(d0))
      .where('ts', '<', admin.firestore.Timestamp.fromDate(d1));
    
    const [snap, purchasesData] = await Promise.all([
      q.get(),
      getPurchasesInRange({ startDate: d0, endDateExclusive: d1 })
    ]);

    const buckets = new Map<string, AnalyticsDaily & { __sid?: Set<string> }>();

    snap.forEach(docSnap => {
      const e = docSnap.data() as AnalyticsEvent;
      eventsProcessed++;

      if (!e.brandId || !e.locationId) return;
      const brandId = e.brandId;
      const locationId = e.locationId;
      const key = `${brandId}_${locationId}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          id: `${dateKey}_${brandId}_${locationId}`,
          date: dateKey,
          brandId,
          locationId,
          sessions: 0,
          unique_sessions: 0, // Initialize
          view_menu: 0, view_product: 0, add_to_cart: 0, start_checkout: 0,
          click_purchase: 0, payment_succeeded: 0, payment_session_created: 0,
          upsell_offer_shown: 0, upsell_accepted: 0, upsell_rejected: 0,
          revenue_paid: 0, delivery_fees_total: 0, discounts_total: 0,
          agg_version: 1,
          updated_at: admin.firestore.Timestamp.now(),
        } as AnalyticsDaily & { __sid?: Set<string> });
      }

      const b = buckets.get(key)!;

      if (!b.__sid) b.__sid = new Set<string>();
      if (e.sessionId && !['web_vital', 'payment_succeeded', 'payment_session_created'].includes(e.name)) {
        b.__sid.add(e.sessionId);
      }

      switch (e.name) {
        case 'view_menu': b.view_menu++; break;
        case 'view_product': b.view_product++; break;
        case 'add_to_cart': b.add_to_cart++; break;
        case 'start_checkout': b.start_checkout++; break;
        case 'click_purchase': b.click_purchase++; break;
        // Paid-order totals below come from verified orders. Do not mix in
        // payment events here, or the authoritative order totals would be
        // counted twice.
        case 'payment_succeeded':
          break;
        case 'payment_session_created':
          b.payment_session_created++; break;
        case 'upsell_offer_shown': b.upsell_offer_shown++; break;
        case 'upsell_accepted': b.upsell_accepted++; break;
        case 'upsell_rejected': b.upsell_rejected++; break;
        default:
          break;
      }
    });
    
    for (const p of purchasesData) {
        const key = `${p.brandId}_${p.locationId}`;
        if (!buckets.has(key)) {
             buckets.set(key, {
                id: `${dateKey}_${p.brandId}_${p.locationId}`,
                date: dateKey, brandId: p.brandId, locationId: p.locationId,
                sessions: 0, unique_sessions: 0, view_menu: 0, view_product: 0, add_to_cart: 0, start_checkout: 0,
                click_purchase: 0, payment_succeeded: 0, payment_session_created: 0,
                upsell_offer_shown: 0, upsell_accepted: 0, upsell_rejected: 0,
                revenue_paid: 0, delivery_fees_total: 0, discounts_total: 0,
                agg_version: 1, updated_at: admin.firestore.Timestamp.now(), __sid: new Set<string>()
             } as AnalyticsDaily & {__sid?: Set<string>});
        }
        const b = buckets.get(key)!;
        // Purchase rows are split by attribution and device. Sum every group
        // into its brand/location/day bucket instead of keeping only the
        // largest group.
        b.payment_succeeded += p.count;
        b.revenue_paid += p.revenue;
        b.delivery_fees_total += p.deliveryFee;
        b.discounts_total += p.discount;
    }

    for (const [, b] of buckets) {
      b.unique_sessions = b.__sid ? b.__sid.size : 0;
      b.sessions = b.unique_sessions;
      delete b.__sid;

      const docRef = db.collection(COL_DAILY).doc(b.id);
      await docRef.set({ ...b }, { merge: true });
      docsWritten++;
    }
  }
  
  return { daysProcessed: daysProcessedCount, eventsProcessed, docsWritten };
}
