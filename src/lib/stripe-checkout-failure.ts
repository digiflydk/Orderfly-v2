// Network errors, 5xx and idempotency conflicts have uncertain outcomes. A
// reservation may be released only for a definite non-payable rejection.
export function isDefinitiveStripeRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { type?: string; statusCode?: number; headers?: Record<string, string> };
  if (value.headers?.['stripe-should-retry'] === 'true') return false;
  return ['StripeInvalidRequestError', 'StripeAuthenticationError', 'StripePermissionError', 'StripeRateLimitError'].includes(value.type || '')
    && [400, 401, 403, 404, 429].includes(value.statusCode || 0);
}
