export function restaurantClock(now: Date) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Copenhagen', weekday: 'long' }).format(now).toLowerCase();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { day, time };
}

export function newsletterEligible(consent: boolean, pendingId: string | undefined, discountId: string, usage: number) {
  return usage === 0 && (!consent || pendingId === discountId);
}

export function cartLineEligible(isCombo: boolean, catalogPrice: number, chargedUnitPrice: number, hasItemOffer: boolean) {
  return !isCombo && !hasItemOffer && chargedUnitPrice >= catalogPrice;
}

export function assignedCustomerMatches(assignedId: string | undefined, customerId: string | undefined) {
  return !assignedId || assignedId === customerId;
}
