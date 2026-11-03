import type { ClubAdminSummary, SignupDiscountSummary } from '@/lib/loyalty/stamp-card/club-admin-summary';
import type { ClubOverviewRow } from './club-overview';

export function discountValueLabel(discount: Pick<SignupDiscountSummary, 'discountType' | 'discountValue'>) {
  return discount.discountType === 'percentage' ? `Procent · ${discount.discountValue} %` : `Beløb · ${discount.discountValue} kr.`;
}

// The signup discount checkout actually offers for the campaign's type.
// null: the administrator may not see discounts; '': none is offered.
export function campaignDiscountLabel(summary: Pick<ClubAdminSummary, 'discounts'>): string | null {
  if (summary.discounts === null) return null;
  const used = summary.discounts.filter(discount => discount.usedInCheckout);
  if (!used.length) return '';
  return discountValueLabel(used[0]) + (used.length > 1 ? ` · +${used.length - 1} flere` : '');
}

export function overviewRow(summary: ClubAdminSummary): ClubOverviewRow {
  const campaign = summary.campaign;
  const type = summary.checkoutMode === 'club' ? 'club' : summary.checkoutMode === 'none' ? 'none'
    : summary.campaignSaved ? 'newsletter' : 'newsletter_default';
  const hasCampaign = summary.checkoutMode !== 'none' || !!campaign?.welcome.enabled || !!campaign?.profile.enabled;
  return {
    brandId: summary.brandId, brandName: summary.brandName, createdAt: summary.createdAt, type,
    discount: campaignDiscountLabel(summary), live: summary.live,
    omnisend: summary.omnisend === null ? null : summary.omnisend === 'connected' ? 'active' : 'inactive',
    canEdit: !!campaign, canDelete: !!campaign && !campaign.invalid && hasCampaign, version: campaign?.version ?? 0,
  };
}
