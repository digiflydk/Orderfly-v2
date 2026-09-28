export function restaurantClock(now: Date) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Copenhagen', weekday: 'long' }).format(now).toLowerCase();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { day, time };
}

export function newsletterEligible(consent: boolean, pendingId: string | undefined, discountId: string, usage: number) {
  return usage === 0 && (!consent || pendingId === discountId);
}

// Only the newsletter campaign may opt into already discounted merchandise.
// Other cart offers continue to compete for the best price, without stacking.
export function newsletterAllowsStacking(discount: { applicationType?: string; allowStacking?: boolean } | null | undefined) {
  return discount?.applicationType === 'newsletter_signup' && discount.allowStacking === true;
}

export function cartLineEligible(isCombo: boolean, catalogPrice: number, chargedUnitPrice: number, hasItemOffer: boolean) {
  return !isCombo && !hasItemOffer && chargedUnitPrice >= catalogPrice;
}

// Manual codes count only full-price, non-combo merchandise. If the whole
// merchandise basket reaches a minimum but the eligible part does not, explain
// the exclusion instead of claiming the order itself is below the minimum.
export function discountMinimumError(minimum: number | undefined, eligibleSubtotal: number, chargedSubtotal = eligibleSubtotal): string | null {
  if (!minimum || eligibleSubtotal >= minimum) return null;
  if (Number.isFinite(chargedSubtotal) && chargedSubtotal >= minimum && eligibleSubtotal < chargedSubtotal) {
    return `Rabatkoden kan ikke kombineres med varer, der allerede har rabat, eller menuer. Kun ${eligibleSubtotal.toFixed(2)} kr. i varer uden andet tilbud tæller med mod minimumsbeløbet på ${minimum.toFixed(2)} kr.`;
  }
  return `Minimumsbeløbet på ${minimum.toFixed(2)} kr. er ikke nået.`;
}

export function assignedCustomerMatches(assignedId: string | undefined, customerId: string | undefined) {
  return !assignedId || assignedId === customerId;
}
