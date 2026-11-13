// Scope is part of the URL. Only public catalog/config reads use this cache.
const reads = new Map<string, {expires: number; promise: Promise<unknown>}>();
type ReadOptions<T> = { retryTransient?: boolean; validate?: (value: unknown) => value is T };
class PublicReadError extends Error { constructor(readonly retryable: boolean) { super('Public data unavailable'); } }
export function publicRead<T>(url: string, timeout = 5000, options: ReadOptions<T> = {}): Promise<T> {
  const existing = reads.get(url);
  if (existing && existing.expires > Date.now()) return existing.promise.then(value => {
    if (options.validate && !options.validate(value)) {
      if (reads.get(url) === existing) reads.delete(url);
      throw new PublicReadError(false);
    }
    return value as T;
  });
  const attempt = async (): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => fetch(url, {signal: controller.signal})).catch(() => { throw new PublicReadError(true); }).then(async response => {
          if (!response.ok) throw new PublicReadError(response.status === 408 || response.status >= 500);
          const value: unknown = await response.json();
          if (options.validate && !options.validate(value)) throw new PublicReadError(false);
          return value as T;
        }),
        new Promise<T>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PublicReadError(true)); }, timeout); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const request = (async () => {
    try { return await attempt(); }
    catch (error) {
      if (!options.retryTransient || !(error instanceof PublicReadError) || !error.retryable) throw error;
      // One retry of the catalog GET only. Never repeat add-to-cart or another
      // side effect, and never retry malformed/scope/auth responses.
      await new Promise(resolve => setTimeout(resolve, 200));
      return attempt();
    }
  })().catch(error => { if (reads.get(url)?.promise === request) reads.delete(url); throw error; });
  if (reads.size >= 50) reads.delete(reads.keys().next().value!);
  reads.set(url, {promise: request, expires: Date.now() + 60000});
  return request;
}
