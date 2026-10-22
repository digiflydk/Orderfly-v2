export function discountApplicationType(discount: { applicationType?: string; code?: string }) {
  return discount.applicationType ?? (discount.code === 'NEWSLETTER_SIGNUP' ? 'newsletter_signup' : discount.code === 'CLUB_SIGNUP' ? 'club_signup' : 'code');
}

export function restaurantClock(now: Date) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Copenhagen', weekday: 'long' }).format(now).toLowerCase();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return { day, time };
}

export function newsletterEligible(consent: boolean, pendingId: string | undefined, discountId: string, usage: number) {
  return usage === 0 && (!consent || pendingId === discountId);
}

// Signup campaigns may opt into already discounted merchandise.
// Other cart offers continue to compete for the best price, without stacking.
export function newsletterAllowsStacking(discount: { applicationType?: string; allowStacking?: boolean } | null | undefined) {
  return isSignupDiscount(discount) && discount?.allowStacking === true;
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
    return `Rabatkoden kan ikke kombineres med varer, der allerede har rabat, eller menuer. Kun ${eligibleSubtotal.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr. i varer uden andet tilbud tæller med mod minimumsbeløbet på ${minimum.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
  }
  return `Minimumsbeløbet på ${minimum.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr. er ikke nået.`;
}

export function assignedCustomerMatches(assignedId: string | undefined, customerId: string | undefined) {
  return !assignedId || assignedId === customerId;
}

export type CheckoutSignupMode = 'none' | 'newsletter' | 'club';
export function isSignupDiscount(discount: {applicationType?: string; code?: string} | null | undefined) {
  return !!discount && ['newsletter_signup', 'club_signup'].includes(discountApplicationType(discount));
}

// Missing configuration retains the existing newsletter checkout. A malformed
// saved configuration fails closed rather than silently switching campaigns.
export function checkoutSignupMode(config: unknown, brandId?: string): CheckoutSignupMode {
  if (config === undefined || config === null) return 'newsletter';
  if (typeof config !== 'object' || Array.isArray(config)) return 'none';
  const data = config as {brandId?: unknown; settings?: {checkoutMode?: unknown}};
  if (brandId && data.brandId !== brandId) return 'none';
  const mode = data.settings?.checkoutMode;
  return mode === 'newsletter' || mode === 'club' || mode === 'none' ? mode : 'none';
}

export function signupModeAllows(applicationType: string, mode: CheckoutSignupMode) {
  return applicationType === 'newsletter_signup' ? mode === 'newsletter' : applicationType === 'club_signup' ? mode === 'club' : true;
}

export function clubDiscountEligible(pendingId: string | undefined, discountId: string, usage: number) {
  return pendingId === discountId && usage === 0;
}
