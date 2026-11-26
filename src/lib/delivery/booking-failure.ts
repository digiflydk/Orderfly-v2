/**
 * Merchant-facing explanation of a rejected courier booking.
 *
 * Only these codes are ever projected to the browser. Any other provider or
 * local rejection code is collapsed to `booking_rejected`, so native error text,
 * native codes and provider payloads never reach the UI.
 *
 * Sources: local preparation rejections (booking/dispatcher.ts), Wolt adapter
 * rejections (providers/wolt/provider.ts) and Wolt HTTP error classes
 * (providers/wolt/http.ts) for a create that Wolt definitively rejected.
 */
export const BOOKING_FAILURE_CODES = [
  'quote_expired', 'quote_changed', 'settings_changed', 'quote_changed_or_expired', 'binding_changed_before_dispatch',
  'invalid_create_payload', 'invalid_request', 'authentication', 'configuration', 'unavailable', 'rate_limited', 'provider_error',
] as const;
export type BookingFailureCode = typeof BOOKING_FAILURE_CODES[number] | 'booking_rejected';

export function projectBookingFailureCode(code: unknown): BookingFailureCode {
  return (BOOKING_FAILURE_CODES as readonly unknown[]).includes(code) ? code as BookingFailureCode : 'booking_rejected';
}

const SUPPORT = 'Kontakt Orderfly-support, hvis det sker igen.';
const MESSAGES: Record<BookingFailureCode, string> = {
  quote_expired: `Leveringsprisen udløb, før kurérbestillingen blev sendt til Wolt. ${SUPPORT}`,
  quote_changed: `Leveringstilbuddet passede ikke længere til ordren, så kurérbestillingen blev ikke sendt. ${SUPPORT}`,
  quote_changed_or_expired: `Wolts leveringspris var udløbet eller ændret, da kurérbestillingen skulle sendes. ${SUPPORT}`,
  settings_changed: 'Leveringsindstillingerne (pris, åbningstid eller afhentningstid) blev ændret efter kundens bestilling. Kontrollér leveringsindstillingerne.',
  binding_changed_before_dispatch: 'Wolt-forbindelsen for restauranten blev ændret lige før kurérbestillingen. Kontrollér Wolt-opsætningen under Levering.',
  invalid_create_payload: `Ordrens leveringsoplysninger kunne ikke sendes til Wolt. ${SUPPORT}`,
  invalid_request: 'Ordrens leveringsoplysninger blev afvist (fx adresse, telefonnummer eller tidspunkt). Kontakt kunden, hvis ordren skal afhentes i stedet.',
  authentication: 'Wolt afviste restaurantens adgangsnøgle. Kontakt Orderfly-support, før flere kurérordrer modtages.',
  configuration: 'Restauranten mangler opsætning hos Wolt (fx venue eller betalingsaftale). Kontakt Wolt eller Orderfly-support.',
  unavailable: 'Wolt kunne ikke levere til adressen eller tidspunktet (fx uden for leveringsområdet eller lukket). Kontakt kunden, hvis ordren skal afhentes i stedet.',
  rate_limited: `Wolt modtog for mange forespørgsler på én gang og afviste kurérbestillingen. ${SUPPORT}`,
  provider_error: `Wolt havde en teknisk fejl og afviste kurérbestillingen. ${SUPPORT}`,
  booking_rejected: 'Kurérbestillingen blev afvist. Kontakt Orderfly-support og oplys fejlkoden.',
};

/** Short, actionable Danish text. Unknown input gets the generic message. */
export function bookingFailureMessage(code: string | null | undefined): string {
  return MESSAGES[projectBookingFailureCode(code)];
}

/**
 * Every definitive rejection starts an automatic full refund (booking/dispatcher.ts
 * -> payments/refund-worker.ts). Only a projected refund is stated as done.
 */
export function bookingFailureRefundNote(paymentStatus: string | null | undefined): string | null {
  const status = paymentStatus?.toLowerCase();
  if (status === 'refunded') return 'Ingen kurér er bestilt. Kunden er refunderet automatisk, og ordren er annulleret.';
  if (status === 'paid') return 'Ingen kurér er bestilt. Refundering til kunden startes automatisk – kontakt Orderfly-support, hvis betalingen ikke skifter til Refunderet.';
  return 'Ingen kurér er bestilt.';
}
