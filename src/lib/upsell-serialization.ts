/** Convert database timestamps before crossing the server/client boundary. */
export function upsellClientData<T>(value: T): T {
  if (value == null || typeof value !== 'object' || value instanceof Date) return value;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  if (Array.isArray(value)) return value.map(upsellClientData) as T;
  return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,upsellClientData(v)])) as T;
}
