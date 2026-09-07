// Only for optional/read-only work. Never time out a payment request and assume
// that Stripe did not receive it.
export async function optionalCheckoutValue<T>(read: () => Promise<T>, fallback: T, timeoutMs = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
