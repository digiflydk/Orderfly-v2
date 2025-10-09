

import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';
import type { AnalyticsEvent, AnalyticsDaily, FunnelFilters, FunnelOutput } from '@/types';
import { getPurchasesInRange } from './sources/orders';
import { startOfDay, endOfDay } from 'date-fns';

const COL_EVENTS = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_EVENTS || 'analytics_events';
const COL_DAILY = process.env.NEXT_PUBLIC_FS_COL_ANALYTICS_DAILY || 'analytics_daily';

type StepKey = 'view_menu'|'view_product'|'add_to_cart'|'start_checkout'|'click_purchase'|'payment_succeeded';

const STEP_ORDER: StepKey[] = [
  'view_menu','view_product','add_to_cart','start_checkout','click_purchase','payment_succeeded'
];

function addNum(a?: number, b?: number){ const x=Number(a||0), y=Number(b||0); return Number.isFinite(x+y)?x+y:0; }

// This function ensures that the funnel steps are always monotonically decreasing.
function clampMonotone(totals: Record<string, number>) {
  for (let i=1;i<STEP_ORDER.length;i++){
    const prevStep = STEP_ORDER[i-1];
    const currentStep = STEP_ORDER[i];
    
    // Ensure the current step is not greater than the previous step.
    if (totals[currentStep] > totals[prevStep]) {
        totals[currentStep] = totals[prevStep];
    }
  }
}

export async function getFunnelData(filters: FunnelFilters, _user?: any): Promise<FunnelOutput> {
  const dateFrom = startOfDay(new Date(filters.dateFrom));
  const dateTo   = endOfDay(new Date(filters.dateTo));
  const dateFromKey = filters.dateFrom.slice(0,10);
  const dateToKey   = filters.dateTo.slice(0,10);

  const totals:any = {
    sessions:0, view_menu:0, view_product:0, add_to_cart:0, start_checkout:0, click_purchase:0,
    payment_succeeded:0, payment_session_created:0, upsell_offer_shown:0, upsell_accepted:0, upsell_rejected:0,
    revenue_paid:0, delivery_fees_total:0, discounts_total:0,
  };
  
  const purchasesData = await getPurchasesInRange({ startDate: dateFrom, endDate: dateTo, brandId: filters.brandId, locationId: filters.locationId });
  const purchaseCount = purchasesData.reduce((s,p)=>s+p.count,0);


  if (filters.counting === 'unique') {
      const evWhere: any[] = [
          where('ts','>=',Timestamp.fromDate(dateFrom)),
          where('ts','<=',Timestamp.fromDate(dateTo)),
      ];
      if (filters.brandId && filters.brandId !== 'all')    evWhere.push(where('brandId','==',filters.brandId));
      if (filters.locationId && filters.locationId !== 'all') evWhere.push(where('locationId','==',filters.locationId));
      
      const eventSnapshots = await getDocs(query(collection(db, COL_EVENTS), ...evWhere));
      
      const stepSets: Record<StepKey, Set<string>> = {
          view_menu:new Set(), view_product:new Set(), add_to_cart:new Set(),
          start_checkout:new Set(), click_purchase:new Set(), payment_succeeded:new Set(),
      };
      
      const allSessionIds = new Set<string>();

      eventSnapshots.forEach(docSnap => {
          const e = docSnap.data() as AnalyticsEvent;
          const sid = e.sessionId || e.id;
          if (sid) {
              allSessionIds.add(sid);
              if (e.name && stepSets[e.name as StepKey]) {
                  stepSets[e.name as StepKey].add(sid);
              }
          }
      });
      
      purchasesData.forEach(p => {
          p.sessionIds.forEach(sid => {
              allSessionIds.add(sid);
              stepSets.payment_succeeded.add(sid);
          });
      });

      totals.sessions = allSessionIds.size;
      Object.keys(stepSets).forEach(key => {
          totals[key as StepKey] = stepSets[key as StepKey].size;
      });
      totals.payment_succeeded = stepSets.payment_succeeded.size;

  } else { // 'events' counting
      let q: any = query(collection(db, COL_DAILY),
          where('date','>=',dateFromKey),
          where('date','<=',dateToKey)
      );
      if (filters.brandId && filters.brandId !== 'all')   q = query(q, where('brandId','==',filters.brandId));
      if (filters.locationId && filters.locationId !== 'all') q = query(q, where('locationId','==',filters.locationId));

      const snap = await getDocs(q);

      snap.forEach(doc=>{
        const d = doc.data() as AnalyticsDaily;
        totals.view_menu             = addNum(totals.view_menu, d.view_menu);
        totals.view_product          = addNum(totals.view_product, d.view_product);
        totals.add_to_cart           = addNum(totals.add_to_cart, d.add_to_cart);
        totals.start_checkout        = addNum(totals.start_checkout, d.start_checkout);
        totals.click_purchase        = addNum(totals.click_purchase, d.click_purchase);
        totals.payment_session_created = addNum(totals.payment_session_created, d.payment_session_created);
        totals.upsell_offer_shown    = addNum(totals.upsell_offer_shown, d.upsell_offer_shown);
        totals.upsell_accepted       = addNum(totals.upsell_accepted, d.upsell_accepted);
        totals.upsell_rejected       = addNum(totals.upsell_rejected, d.upsell_rejected);
        totals.sessions              = addNum(totals.sessions, d.sessions);
      });
      
      // For "All Events", the session count should logically start at the top of the funnel
      totals.sessions = totals.view_menu;
      totals.payment_succeeded = purchaseCount;
  }

  // Override purchases with robust order data regardless of counting method
  totals.revenue_paid      = purchasesData.reduce((s,p)=>s+p.revenue,0);
  totals.delivery_fees_total = purchasesData.reduce((s,p)=>s+p.deliveryFee,0);
  totals.discounts_total = purchasesData.reduce((s,p)=>s+p.discount,0);
  
  // ALWAYS clamp the funnel to be monotonic, regardless of counting method.
  clampMonotone(totals);

  return { totals, daily: [], byLocation: [] } as FunnelOutput;
}
