import { promotionDate } from './promotion-date';

export type PromotionEligibilityIssue = 'no_current_location' | 'expired' | 'not_started';

// A configured "Active" switch is not proof that customers can use a rule
// (#206). Mirrors checkout: dates are exact instants, and a rule scoped only to
// deleted locations is valid nowhere. An empty location list means all
// locations of the brand. Pure display policy; no record is changed.
export function promotionEligibilityIssues(
  promotion: { brandId: string; locationIds?: string[] | null; startDate?: unknown; endDate?: unknown },
  currentLocations: Array<{ id: string; brandId: string }>,
  now: Date = new Date(),
): PromotionEligibilityIssue[] {
  const issues: PromotionEligibilityIssue[] = [];
  const scoped = Array.isArray(promotion.locationIds) ? promotion.locationIds : [];
  if (scoped.length && !scoped.some(id => currentLocations.some(location => location.id === id && location.brandId === promotion.brandId)))
    issues.push('no_current_location');
  const end = promotionDate(promotion.endDate), start = promotionDate(promotion.startDate);
  if (end && end < now) issues.push('expired');
  if (start && start > now) issues.push('not_started');
  return issues;
}

export const promotionEligibilityText: Record<PromotionEligibilityIssue, string> = {
  no_current_location: 'Ingen nuværende butik valgt',
  expired: 'Udløbet',
  not_started: 'Ikke startet endnu',
};
