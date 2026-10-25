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
