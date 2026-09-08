// Optional persistence. Failed writes/removals keep this session's latest choice.
const memory = new Map<string, string>();
const pending = new Set<string>();
export function optionalGet(key: string): string | null {
  if (pending.has(key)) return memory.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) memory.delete(key); else memory.set(key, value);
    return value;
  } catch { return memory.get(key) ?? null; }
}
export function optionalSet(key: string, value: string) {
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); pending.delete(key); }
  catch { pending.add(key); }
}
export function optionalRemove(key: string) {
  memory.delete(key);
  try { window.localStorage.removeItem(key); pending.delete(key); }
  catch { pending.add(key); }
}
