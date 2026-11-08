import { AsyncLocalStorage } from 'node:async_hooks';
// Deduplicate reads within one HTTP request only. Never reuse another tenant's data.
const reads = new AsyncLocalStorage<Map<string, Promise<unknown>>>();
export function withUpsellReads<T>(work: () => Promise<T>) { return reads.run(new Map(), work); }
export function upsellRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const cache = reads.getStore();
  if (!cache) return read();
  if (!cache.has(key)) cache.set(key, read());
  return cache.get(key) as Promise<T>;
}
