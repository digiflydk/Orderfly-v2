const CUSTOMER_IDENTITY_CONFLICTS = new Set([
  'Customer identity scope conflict.',
  'Customer email and phone point to different profiles.',
  'Customer email identity scope conflict.',
  'Customer phone identity scope conflict.',
  'ambiguous_email_identity',
  'ambiguous_phone_identity',
  'customer_identity_conflict',
]);

export const CUSTOMER_IDENTITY_CHECKOUT_MESSAGE =
  'E-mail og telefonnummer matcher ikke samme kundeprofil. Kontrollér begge oplysninger og prøv igen. Har du et personligt rabatkort, skal du bruge kortets e-mailadresse.';

/**
 * Maps known internal identity safeguards to one privacy-preserving customer message.
 * The text deliberately does not reveal which identifier already exists.
 */
export function checkoutCustomerIdentityMessage(error: unknown): string | null {
  return error instanceof Error && CUSTOMER_IDENTITY_CONFLICTS.has(error.message)
    ? CUSTOMER_IDENTITY_CHECKOUT_MESSAGE
    : null;
}

const CHECKOUT_FAILURE_CODES: Record<string, string> = Object.fromEntries([
  'configuration', 'validation', 'customer', 'club_signup', 'newsletter_consent',
  'reservation_reconcile', 'order', 'reservation', 'pickup_acceptance',
  'worldline_session', 'coupon', 'stripe_session', 'session_link',
].map(stage => [stage, `CHECKOUT_${stage.toUpperCase()}`]));

/** Support diagnostics contain only fixed stage names or validated numeric provider codes. */
export function checkoutFailureCode(stage: string, error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (stage === 'worldline_session' && typeof code === 'string') {
    const match = /^WORLDLINE_CHECKOUT_(HTTP_[1-5][0-9]{2}|PROVIDER_[0-9]{4}|REJECTED|UNKNOWN)$/.exec(code);
    if (match?.[0] === code) return code;
  }
  return Object.hasOwn(CHECKOUT_FAILURE_CODES, stage) ? CHECKOUT_FAILURE_CODES[stage] : 'CHECKOUT_UNAVAILABLE';
}
