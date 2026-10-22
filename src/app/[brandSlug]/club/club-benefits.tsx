import { stampWord } from './texts';

export type ClubDiscountSummary = {
  id: string; discountType: 'percentage' | 'fixed_amount'; discountValue: number; description?: string;
  minOrderValue?: number; allowStacking: boolean; firstTimeCustomerOnly?: boolean; endsAt?: number | null;
  locationIds?: string[]; orderTypes?: ('pickup' | 'delivery')[];
  activeDays?: string[]; activeTimeSlots?: { start: string; end: string }[];
};
export type ProfileBonusCampaign = { stamps: number; requiredFields: string[] };
export type SignupCampaigns = { version?: string; welcomeStamps: number; profile: ProfileBonusCampaign | null; discount: ClubDiscountSummary | null };
export type MemberCampaigns = { profile: ProfileBonusCampaign | null; profileBonusGranted: boolean; discount: ClubDiscountSummary | null };
const FIELD_NAMES: Record<string, string> = { phone: 'telefonnummer', birthDate: 'fødselsdato', gender: 'køn' };
const DAYS: Record<string, string> = { monday: 'mandag', tuesday: 'tirsdag', wednesday: 'onsdag', thursday: 'torsdag',
  friday: 'fredag', saturday: 'lørdag', sunday: 'søndag' };
const money = (value: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 2 }).format(value);
const amount = (discount: ClubDiscountSummary) => discount.discountType === 'percentage' ? `${discount.discountValue} %` : money(discount.discountValue);
const fieldNames = (campaign: ProfileBonusCampaign) => campaign.requiredFields.map(field => FIELD_NAMES[field] ?? field).join(', ');
const positive = (count: number) => Number.isSafeInteger(count) && count > 0;
const validDiscount = (discount: ClubDiscountSummary | null | undefined): discount is ClubDiscountSummary =>
  !!discount && Number.isFinite(discount.discountValue) && discount.discountValue > 0 && (discount.discountType !== 'percentage' || discount.discountValue <= 100);

// Values are a server-filtered offer/entitlement, never client-side eligibility.
// Text is rendered by React so merchant descriptions cannot become executable markup.
function DiscountConditions({ discount }: { discount: ClubDiscountSummary }) {
  const days = discount.activeDays ?? [], slots = discount.activeTimeSlots ?? [];
  const expires = discount.endsAt !== null && discount.endsAt !== undefined && Number.isFinite(discount.endsAt)
    ? new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(discount.endsAt) : null;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed">
      {discount.description && <p className="break-words">{discount.description}</p>}
      {!!discount.minOrderValue && <p>Mindstekøb: {money(discount.minOrderValue)} i {discount.allowStacking ? 'varer efter varerabatter' : 'varer uden anden rabat'}.</p>}
      <p>{discount.allowStacking
        ? 'Gælder på varer efter varerabatter, inklusive tilvalg og menuer. Pose, levering og gebyrer er ikke med.'
        : 'Gælder kun varer uden anden rabat. Gælder ikke menuer, pose, levering eller gebyrer.'}</p>
      {discount.firstTimeCustomerOnly && <p>Gælder kun dit første køb.</p>}
      {!!discount.orderTypes?.length && <p>Gælder {discount.orderTypes.map(type => type === 'pickup' ? 'afhentning' : 'levering').join(' og ')}.</p>}
      {days.length > 0 && days.length < 7 && <p>Gyldige dage: {days.map(day => DAYS[day] ?? day).join(', ')} (dansk tid).</p>}
      {slots.length > 0 && <p>Gyldige tidspunkter: {slots.map(slot => `${slot.start}–${slot.end}`).join(', ')} (dansk tid).</p>}
      {!!discount.locationIds?.length && <p>Gælder kun kampagnens valgte afdelinger. Den valgte afdeling kontrolleres i checkout.</p>}
      {expires && <p>Gyldig indtil {expires}.</p>}
      <p>Personlig engangsrabat. Kan ikke kombineres med en anden rabatkode eller tilmeldingsrabat. Alle kampagnevilkår kontrolleres i checkout.</p>
    </div>
  );
}

export function SignupBenefits({ campaigns }: { campaigns?: SignupCampaigns | null }) {
  const welcome = positive(campaigns?.welcomeStamps ?? 0), profile = campaigns?.profile;
  const discount = campaigns?.discount;
  if (!welcome && !validDiscount(discount) && !positive(profile?.stamps ?? 0)) return null;
  return (
    <section aria-label="Fordele ved Club-tilmelding" className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/40 p-4 text-left">
      <h2 className="text-xl">Dine velkomstfordele</h2>
      {welcome && <p>Som nyt medlem får du <strong>{campaigns!.welcomeStamps} {stampWord(campaigns!.welcomeStamps)}</strong> på dit digitale stempelkort. Velkomstbonussen gives én gang.</p>}
      {validDiscount(discount) && <>
        <p>Som nyt medlem får du <strong>{amount(discount)} rabat</strong> til dit næste køb. Rabatten gemmes på din medlemsprofil og kan bruges én gang.</p>
        <DiscountConditions discount={discount} />
      </>}
      {profile && positive(profile.stamps) && <p>Efter tilmelding kan du få <strong>{profile.stamps} ekstra {stampWord(profile.stamps)}</strong> ved at udfylde {fieldNames(profile)} på din profil. Profilbonussen gives én gang.</p>}
    </section>
  );
}

export function ProfileBonusHint({ campaign, claimed, profileHref }: {
  campaign?: ProfileBonusCampaign | null; claimed: boolean; profileHref?: string;
}) {
  if (claimed || !campaign || !positive(campaign.stamps)) return null;
  return (
    <aside aria-label="Bonus for dine profiloplysninger" className="flex min-w-0 flex-col gap-2 rounded-xl border border-primary/40 p-4 text-left">
      <h2 className="text-xl">{campaign.stamps === 1 ? 'Få et ekstra stempel' : 'Få ekstra stempler'}</h2>
      <p>Udfyld {fieldNames(campaign)}, og få <strong>{campaign.stamps} ekstra {stampWord(campaign.stamps)}</strong>. Bonussen gives én gang.</p>
      {campaign.requiredFields.includes('gender') && <p className="text-sm">Ved køn kan du også vælge »Ønsker ikke at oplyse«.</p>}
      {profileHref && <a href={profileHref} className="self-start py-2 underline underline-offset-4">Udfyld din profil</a>}
    </aside>
  );
}

export function MemberDiscountBenefit({ discount, base }: { discount?: ClubDiscountSummary | null; base: string }) {
  if (!validDiscount(discount)) return null;
  const shop = base.endsWith('/club') ? base.slice(0, -'/club'.length) || '/' : '/';
  return (
    <section aria-label="Din personlige Club-rabat" className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/40 p-4 text-left">
      <h2 className="text-xl">Din Club-rabat</h2>
      <p>Du har <strong>{amount(discount)} rabat</strong> til ét køb i webshoppen.</p>
      <p>Brug samme e-mail som dit Club-medlemskab, når du bestiller. Rabatten findes automatisk i checkout, hvis bestillingen opfylder vilkårene.</p>
      <DiscountConditions discount={discount} />
      <a href={shop} className="self-start py-2 underline underline-offset-4">Bestil i webshoppen</a>
    </section>
  );
}

export function MemberBenefits({ campaigns, base }: { campaigns?: MemberCampaigns | null; base: string }) {
  if (!validDiscount(campaigns?.discount) && !(campaigns?.profile && !campaigns.profileBonusGranted && positive(campaigns.profile.stamps))) return null;
  return <div className="col-span-full flex min-w-0 flex-col gap-6">
    <MemberDiscountBenefit discount={campaigns?.discount} base={base} />
    <ProfileBonusHint campaign={campaigns?.profile} claimed={campaigns?.profileBonusGranted ?? false} profileHref={`${base}/profil`} />
  </div>;
}
