// Scope is part of the URL. Only public catalog/config reads use this cache.
const reads = new Map<string, {expires: number; promise: Promise<unknown>}>();
export function publicRead<T>(url: string, timeout = 5000): Promise<T> {
  const existing = reads.get(url);
  if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const request = Promise.race([
    Promise.resolve().then(() => fetch(url, {signal: controller.signal})).then(response => {
      if (!response.ok) throw new Error('Public data unavailable');
      return response.json() as Promise<T>;
    }),
    new Promise<T>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Read timed out')); }, timeout); }),
  ]).finally(() => clearTimeout(timer)).catch(error => { if (reads.get(url)?.promise === request) reads.delete(url); throw error; });
  if (reads.size >= 50) reads.delete(reads.keys().next().value!);
  reads.set(url, {promise: request, expires: Date.now() + 60000});
  return request;
}
