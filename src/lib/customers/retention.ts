// Pure retention maths over purchases from several sources (#834 PR D). No I/O, so it is unit-tested directly.
export type RetentionSource = 'orderfly' | 'dully';
export type RetentionPurchase = { customerId: string; at: number; amount: number; source: RetentionSource };
export type RetentionCohort = { month: string; size: number; retained: Array<number | null> };
export type RetentionReport = {
  buyers: number; repeatBuyers: number; repeatRate: number; purchases: number; amount: number;
  purchasesPerBuyer: number; medianDaysBetween: number | null;
  active: { d30: number; d60: number; d90: number }; lapsed90: number;
  bySource: { orderflyOnly: number; dullyOnly: number; both: number; orderflyPurchases: number; dullyPurchases: number; orderflyAmount: number; dullyAmount: number };
  cohorts: RetentionCohort[];
};

const DAY = 86400000;
export const COHORT_MONTHS = 6;
const month = (at: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit' }).format(new Date(at)).slice(0, 7);
const addMonths = (value: string, n: number) => { const [y, m] = value.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const pct = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : 0;
const round = (value: number) => Math.round(value * 100) / 100;

export function retentionReport(input: RetentionPurchase[], now = Date.now()): RetentionReport {
  const rows = input.filter(p => p.customerId && Number.isFinite(p.at) && p.at <= now && Number.isFinite(p.amount));
  const byCustomer = new Map<string, RetentionPurchase[]>();
  for (const p of rows) byCustomer.set(p.customerId, [...(byCustomer.get(p.customerId) || []), p]);
  const gaps: number[] = [];
  const active = { d30: 0, d60: 0, d90: 0 };
  const bySource = { orderflyOnly: 0, dullyOnly: 0, both: 0, orderflyPurchases: 0, dullyPurchases: 0, orderflyAmount: 0, dullyAmount: 0 };
  const cohortMembers = new Map<string, Array<Set<string>>>();
  let repeatBuyers = 0;
  for (const list of byCustomer.values()) {
    list.sort((a, b) => a.at - b.at);
    if (list.length > 1) repeatBuyers++;
    for (let i = 1; i < list.length; i++) gaps.push((list[i].at - list[i - 1].at) / DAY);
    const since = (now - list[list.length - 1].at) / DAY;
    if (since <= 30) active.d30++; if (since <= 60) active.d60++; if (since <= 90) active.d90++;
    const sources = new Set(list.map(p => p.source));
    if (sources.size > 1) bySource.both++; else if (sources.has('dully')) bySource.dullyOnly++; else bySource.orderflyOnly++;
    const first = month(list[0].at), months = new Set(list.map(p => month(p.at)));
    const members = cohortMembers.get(first) || [];
    members.push(months);
    cohortMembers.set(first, members);
  }
  for (const p of rows) {
    if (p.source === 'dully') { bySource.dullyPurchases++; bySource.dullyAmount += p.amount; } else { bySource.orderflyPurchases++; bySource.orderflyAmount += p.amount; }
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
  const current = month(now);
  // "Retained in month k" = bought again in the k-th calendar month after the first purchase. Future months are null.
  const cohorts = [...cohortMembers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, members]) => ({
    month: m, size: members.length,
    retained: Array.from({ length: COHORT_MONTHS }, (_, i) => { const target = addMonths(m, i + 1); return target > current ? null : pct(members.filter(s => s.has(target)).length, members.length); }),
  }));
  const buyers = byCustomer.size, purchases = rows.length;
  return {
    buyers, repeatBuyers, repeatRate: pct(repeatBuyers, buyers), purchases, amount: round(rows.reduce((s, p) => s + p.amount, 0)),
    purchasesPerBuyer: buyers ? round(purchases / buyers) : 0, medianDaysBetween: median === null ? null : Math.round(median),
    active, lapsed90: buyers - active.d90,
    bySource: { ...bySource, orderflyAmount: round(bySource.orderflyAmount), dullyAmount: round(bySource.dullyAmount) },
    cohorts,
  };
}
