/** Pure delivery economics. Callers must authenticate scope and validate quote freshness. */
export type TaxBasis = 'inclusive' | 'exclusive';
export type DeliveryMoney = { amountMinor: number; currency: string; taxBasis: TaxBasis };
export type RouteDistance = {
  meters: number; method: 'route'; source: string; profile: string; calculatedAt: string;
};
export type DeliveryBand = { fromMeters: number; toMeters: number; feeMinor: number; minimumMinor: number };
export type DistanceTariff = { baseMinor: number; includedMeters: number; perKmMinor: number };
export type DeliveryPricingRules = {
  version: string; currency: string; taxBasis: TaxBasis; maxDistanceMeters: number;
  minimumMinor: number; maximumCustomerFeeMinor: number; maximumSubsidyMinor: number;
  tariff: { kind: 'bands'; bands: DeliveryBand[] } | ({ kind: 'kilometer' } & DistanceTariff);
  freeDelivery?: { minimumMinor: number; maxDistanceMeters: number };
  localCostTariff?: DistanceTariff;
};
export type DeliveryPriceInput = {
  rules: DeliveryPricingRules; route: RouteDistance; itemSubtotalAfterDiscountMinor: number;
  providerCost: DeliveryMoney;
};
export type DeliveryPriceRejection = 'invalid_input' | 'invalid_rules' | 'invalid_route' | 'incompatible_money' | 'outside_area' | 'minimum_not_met' | 'caps_conflict';
export type DeliveryPriceResult = { ok: false; reason: DeliveryPriceRejection } | {
  ok: true;
  snapshot: {
    rules: DeliveryPricingRules; route: RouteDistance; itemSubtotalAfterDiscountMinor: number;
    localCostEstimate: DeliveryMoney | null; providerQuoteCost: DeliveryMoney;
    customerFee: DeliveryMoney; subsidy: DeliveryMoney; actualBilledCost: null;
    freeDeliveryApplied: boolean;
  };
};
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
const tariffValid = (t: DistanceTariff) => t && integer(t.baseMinor) && integer(t.includedMeters) && integer(t.perKmMinor);
const moneyValid = (m: DeliveryMoney) => m && integer(m.amountMinor) && /^[A-Z]{3}$/.test(m.currency) && ['inclusive', 'exclusive'].includes(m.taxBasis);
function timestampValid(value: string): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [,year,month,day,hour,minute,second,,offsetHour,offsetMinute] = match;
  const y=Number(year), m=Number(month), d=Number(day);
  const leap=y%4===0 && (y%100!==0 || y%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return m>=1 && m<=12 && d>=1 && d<=days[m-1] && Number(hour)<24 && Number(minute)<60 && Number(second)<60
    && (!offsetHour || (Number(offsetHour)<24 && Number(offsetMinute)<60)) && Number.isFinite(Date.parse(value));
}
export function isRouteDistance(route: RouteDistance): boolean {
  return !!route && route.method === 'route' && integer(route.meters) && text(route.source) && text(route.profile)
    && timestampValid(route.calculatedAt);
}
export function validateDeliveryPricingRules(r: DeliveryPricingRules): boolean {
  if (!r || !text(r.version) || !/^[A-Z]{3}$/.test(r.currency) || !['inclusive', 'exclusive'].includes(r.taxBasis)
    || ![r.maxDistanceMeters, r.minimumMinor, r.maximumCustomerFeeMinor, r.maximumSubsidyMinor].every(integer)) return false;
  if (r.freeDelivery && (!integer(r.freeDelivery.minimumMinor) || !integer(r.freeDelivery.maxDistanceMeters)
    || r.freeDelivery.maxDistanceMeters > r.maxDistanceMeters)) return false;
  if (r.localCostTariff && !tariffValid(r.localCostTariff)) return false;
  if (!r.tariff) return false;
  if (r.tariff.kind === 'kilometer') return !!tariffValid(r.tariff);
  if (r.tariff.kind !== 'bands' || !Array.isArray(r.tariff.bands) || !r.tariff.bands.length || r.tariff.bands.length > 100) return false;
  let end = 0;
  for (const band of r.tariff.bands) {
    if (!band || ![band.fromMeters, band.toMeters, band.feeMinor, band.minimumMinor].every(integer)
      || band.fromMeters !== end || band.toMeters <= band.fromMeters) return false;
    end = band.toMeters;
  }
  // All intervals are [from,to), except the final interval includes the configured maximum.
  return end === r.maxDistanceMeters;
}
function tariffAmount(t: DistanceTariff, meters: number): number | null {
  // BigInt prevents intermediate precision loss; round half-up once at the minor-unit boundary.
  const result = BigInt(t.baseMinor) + (BigInt(Math.max(0, meters - t.includedMeters)) * BigInt(t.perKmMinor) + BigInt(500)) / BigInt(1000);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
export function calculateDeliveryPrice(input: DeliveryPriceInput): DeliveryPriceResult {
  const reject = (reason: DeliveryPriceRejection): DeliveryPriceResult => ({ ok: false, reason });
  if (!input || !integer(input.itemSubtotalAfterDiscountMinor)) return reject('invalid_input');
  const { rules: r, route, providerCost } = input;
  if (!validateDeliveryPricingRules(r)) return reject('invalid_rules');
  if (!isRouteDistance(route)) return reject('invalid_route');
  if (!moneyValid(providerCost) || providerCost.currency !== r.currency || providerCost.taxBasis !== r.taxBasis) return reject('incompatible_money');
  if (route.meters > r.maxDistanceMeters) return reject('outside_area');
  const band = r.tariff.kind === 'bands' ? r.tariff.bands.find((b, i, bands) => route.meters >= b.fromMeters
    && (route.meters < b.toMeters || (i === bands.length - 1 && route.meters === b.toMeters))) : undefined;
  const minimum = Math.max(r.minimumMinor, band?.minimumMinor ?? 0);
  if (input.itemSubtotalAfterDiscountMinor < minimum) return reject('minimum_not_met');
  const baseFee = r.tariff.kind === 'kilometer' ? tariffAmount(r.tariff, route.meters) : band?.feeMinor ?? null;
  const localEstimate = r.localCostTariff ? tariffAmount(r.localCostTariff, route.meters) : null;
  if (baseFee === null || (r.localCostTariff && localEstimate === null)) return reject('invalid_rules');
  const free = !!r.freeDelivery && input.itemSubtotalAfterDiscountMinor >= r.freeDelivery.minimumMinor && route.meters <= r.freeDelivery.maxDistanceMeters;
  const fee = free ? 0 : Math.max(baseFee, Math.max(0, providerCost.amountMinor - r.maximumSubsidyMinor));
  const subsidy = Math.max(0, providerCost.amountMinor - fee);
  if (fee > r.maximumCustomerFeeMinor || subsidy > r.maximumSubsidyMinor) return reject('caps_conflict');
  const money = (amountMinor: number): DeliveryMoney => ({ amountMinor, currency: r.currency, taxBasis: r.taxBasis });
  return { ok: true, snapshot: {
    rules: structuredClone(r), route: structuredClone(route), itemSubtotalAfterDiscountMinor: input.itemSubtotalAfterDiscountMinor,
    localCostEstimate: localEstimate === null ? null : money(localEstimate), providerQuoteCost: structuredClone(providerCost),
    customerFee: money(fee), subsidy: money(subsidy), actualBilledCost: null, freeDeliveryApplied: free,
  } };
}
