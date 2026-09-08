// DKK contract: round each unit/option to integer øre, then multiply quantities.
// Percentage item offers round the resulting unit price; order discounts/fees
// round once on their integer-øre base. Stripe receives these same integers.
export function ore(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid monetary amount');
  const scaled = value * 100;
  const result = Math.round(scaled + Number.EPSILON * Math.max(1, Math.abs(scaled)));
  if (!Number.isSafeInteger(result)) throw new Error('Monetary amount out of range');
  return result;
}
export function money(value: number): number { return ore(value) / 100; }
export function sumMoney(values: number[]): number { return values.reduce((sum, value) => sum + ore(value), 0) / 100; }
export function lineMoney(unit: number, quantity: number, options: number[] = []): number {
  return (ore(unit) + options.reduce((sum, value) => sum + ore(value), 0)) * quantity / 100;
}
export function percentageMoney(base: number, percentage: number): number {
  return Math.round(ore(base) * Math.max(0, percentage) / 100) / 100;
}
export function discountedUnit(price: number, method: string, value = 0): number {
  const base = ore(price);
  if (!Number.isFinite(value) || value <= 0) return base / 100;
  if (method === 'percentage') return Math.round(base * (100 - Math.min(100, value)) / 100) / 100;
  return method === 'fixed_amount' ? Math.max(0, base - ore(value)) / 100 : base / 100;
}
