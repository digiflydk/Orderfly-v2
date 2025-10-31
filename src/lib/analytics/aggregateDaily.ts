
'use server';

import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, Timestamp, doc, setDoc,
} from 'firebase/firestore';
import type { AnalyticsEvent, AnalyticsDaily } from '@/types';
// Note (OF-375): eachDayOfInterval should precisely match the UI filters
// to avoid a mismatch between the number of days processed and the
// number of days displayed in the UI.
import { eachDayOfInterval, startOfDay, endOfDay, differenceInCalendarDays } from 'date-fns';
import { getPurchasesInRange } from './sources/orders';

const COL_EVENTS = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_EVENTS || 'analytics_events';
const COL_DAILY  = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_DAILY  || 'analytics_daily';

function toDateKey(d: Date) {
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

export async function aggregateDailyData(startISO: string, endISO: string) {
  const localStart = new Date(startISO);
  const localEnd = new Date(endISO); 

  const days = eachDayOfInterval({ start: localStart, end: localEnd });
  const daysProcessedCount = days.length;

  let eventsProcessed = 0;
  let docsWritten = 0;

  for (const day of days) {
    const d0 = startOfDay(day);
    const d1 = endOfDay(day);
    const dateKey = toDateKey(d0);

    const q = query(
      collection(db, COL_EVENTS),
      where('ts', '>=', Timestamp.fromDate(d0)),
      where('ts', '<=', Timestamp.fromDate(d1)),
    );
    
    const [snap, purchasesData] = await Promise.all([
      getDocs(q),
      getPurchasesInRange({ startDate: d0, endDate: d1 })
    ]);

    const buckets = new Map<string, AnalyticsDaily & { __sid?: Set<string> }>();

    snap.forEach(docSnap => {
      const e = docSnap.data() as AnalyticsEvent;
      eventsProcessed++;

      const brandId = (e.brandId || 'unknown');
      const locationId = (e.locationId || 'unknown');
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
          updated_at: Timestamp.now(),
        } as AnalyticsDaily & { __sid?: Set<string> });
      }

      const b = buckets.get(key)!;

      if (!b.__sid) b.__sid = new Set<string>();
      if (e.sessionId) b.__sid.add(e.sessionId);

      switch (e.name) {
        case 'view_menu': b.view_menu++; break;
        case 'view_product': b.view_product++; break;
        case 'add_to_cart': b.add_to_cart++; break;
        case 'start_checkout': b.start_checkout++; break;
        case 'click_purchase': b.click_purchase++; break;
        case 'payment_succeeded':
          // We now rely on the getPurchasesInRange for this, but keep this for backwards compatibility
          b.payment_succeeded++;
          b.revenue_paid += Number(e.cartValue || 0);
          b.delivery_fees_total += Number(e.deliveryFee || 0);
          b.discounts_total += Number(e.discountTotal || 0);
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
    
    // Merge purchase data
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
                agg_version: 1, updated_at: Timestamp.now(), __sid: new Set<string>()
             } as AnalyticsDaily & {__sid?: Set<string>});
        }
        const b = buckets.get(key)!;
        b.payment_succeeded = Math.max(b.payment_succeeded, p.count);
        b.revenue_paid = Math.max(b.revenue_paid, p.revenue);
        p.sessionIds.forEach(sid => b.__sid?.add(sid));
    }

    for (const [, b] of buckets) {
      b.unique_sessions = b.__sid ? b.__sid.size : 0;
      b.sessions = b.unique_sessions; // For now, sessions and unique_sessions are the same.
      delete b.__sid;

      const docRef = doc(collection(db, COL_DAILY), b.id);
      await setDoc(docRef, { ...b }, { merge: true });
      docsWritten++;
    }
  }
  
  return { daysProcessed: daysProcessedCount, eventsProcessed, docsWritten };
}
