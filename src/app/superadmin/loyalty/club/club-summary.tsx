import { formatInTimeZone } from 'date-fns-tz';
import Link from '@/components/superadmin/admin-link';
import type { BonusSummary, ClubAdminPermission, ClubAdminSummary, ClubSuppressedReason, DiscountInactiveReason, OmnisendStatus } from '@/lib/loyalty/stamp-card/club-admin-summary';

const PERMISSION_LABELS: Record<ClubAdminPermission, string> = {
  settings: 'Stempelkort-indstillinger', discountsView: 'Se rabatter', discountsEdit: 'Rediger rabatter', discountsCreate: 'Opret rabatter',
};
const SUPPRESSED_LABELS: Record<ClubSuppressedReason, string> = {
  program_missing: 'stempelkortet er ikke oprettet', program_inactive: 'stempelkortet er ikke aktivt',
  texts_not_ready: 'Club-teksterne mangler oplysninger', brand_unavailable: 'brandet har ingen aktiv webadresse',
};
const INACTIVE_LABELS: Record<DiscountInactiveReason, string> = {
  mode_none: 'Bruges ikke: ingen tilmelding vises i checkout', mode_newsletter: 'Bruges ikke: checkout tilbyder nyhedsbrev',
  mode_club: 'Bruges ikke: checkout tilbyder Club', newsletter_service_pending: 'Bruges ikke: afventer opsætning af nyhedsbrevstjenesten',
};
const MODE_LABELS = { none: 'Ingen tilmeldingskampagne', newsletter: 'Nyhedsbrev', club: 'Club' } as const;
const OMNISEND_LABELS: Record<OmnisendStatus, string> = {
  connected: 'Forbundet', disabled: 'Slået fra for brandet', not_configured: 'Ikke sat op', invalid: 'Opsætningen er ugyldig',
};
const date = (epoch: number) => formatInTimeZone(epoch, 'Europe/Copenhagen', 'dd-MM-yyyy HH:mm');
const linkClass = 'text-sm font-medium underline underline-offset-4';

export function missingPermissionText(missing: ClubAdminPermission[]) {
  return `Kræver: ${missing.map(permission => PERMISSION_LABELS[permission]).join(' og ')}`;
}

function SummaryCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section aria-label={title} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-4">
    <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
    <div className="flex-1 space-y-1 text-sm">{children}</div>
    {action}
  </section>;
}

function Missing({ permissions }: { permissions: ClubAdminPermission[] }) {
  return <p role="note" className="text-muted-foreground">{missingPermissionText(permissions)}</p>;
}

function bonusText(value: BonusSummary, unit: [string, string]) {
  if (!value.enabled) return 'Slået fra';
  const amount = `${value.stamps} ${value.stamps === 1 ? unit[0] : unit[1]}`;
  const period = value.startsAt || value.endsAt
    ? ` · ${value.startsAt ? `fra ${date(value.startsAt)}` : ''}${value.startsAt && value.endsAt ? ' ' : ''}${value.endsAt ? `til ${date(value.endsAt)}` : ''}` : '';
  return `${value.activeNow ? 'Gives nu' : 'Gives ikke nu'} · ${amount}${period}`;
}

export function ClubSummary({ summary }: { summary: ClubAdminSummary }) {
  const { campaign, discounts, texts, omnisend, permissions, brandId } = summary;
  const campaignMissing = (['settings', 'discountsEdit'] as const).filter(permission => !permissions[permission]);
  const textsHref = `/superadmin/loyalty/stamp-card?tab=settings&edit=${encodeURIComponent(brandId)}`;
  return <div aria-label="Status for Club og nyhedsbrev" role="region" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <SummaryCard title="Tilbud i checkout">
      {campaign ? <>
        <p className="text-lg font-semibold">{MODE_LABELS[campaign.checkoutMode]}</p>
        {campaign.clubSuppressed && <p role="alert" className="text-destructive">Vises ikke i checkout: {SUPPRESSED_LABELS[campaign.clubSuppressed]}.</p>}
        {campaign.invalid && <p role="alert" className="text-destructive">Den gemte kampagne kan ikke læses. Kontakt en administrator.</p>}
        {!campaign.saved && <p className="text-muted-foreground">Ikke gemt endnu. Checkout bruger nyhedsbrev som standard.</p>}
      </> : <Missing permissions={campaignMissing} />}
    </SummaryCard>

    <SummaryCard title="Tilmeldingsrabat" action={permissions.discountsView && <div className="flex flex-wrap gap-x-4 gap-y-1">
      <Link href="/superadmin/discounts" className={linkClass}>Se rabatter</Link>
      {permissions.discountsCreate && <Link href="/superadmin/discounts/new" className={linkClass}>Opret tilmeldingsrabat</Link>}
    </div>}>
      {discounts ? discounts.length ? <ul className="space-y-1">{discounts.map(discount => <li key={discount.id}>
        <span className="font-medium">{discount.applicationType === 'club_signup' ? 'Club' : 'Nyhedsbrev'}</span>
        {' · '}{discount.discountType === 'percentage' ? `${discount.discountValue} %` : `${discount.discountValue} kr.`}
        {discount.description ? ` · ${discount.description}` : ''}{discount.endsAt ? ` · til ${date(discount.endsAt)}` : ''}
        <span className={`block text-xs ${discount.usedInCheckout ? 'text-muted-foreground' : 'text-destructive'}`}>{discount.inactiveReason ? INACTIVE_LABELS[discount.inactiveReason] : 'Bruges i checkout'}</span>
      </li>)}</ul> : <p>Ingen aktiv rabat</p> : <Missing permissions={['discountsView']} />}
    </SummaryCard>

    <SummaryCard title="Velkomststempel">
      {campaign ? <p>{bonusText(campaign.welcome, ['velkomststempel', 'velkomststempler'])}</p> : <Missing permissions={campaignMissing} />}
    </SummaryCard>

    <SummaryCard title="Stempel for udfyldt profil">
      {campaign ? <p>{bonusText(campaign.profile, ['profilstempel', 'profilstempler'])}</p> : <Missing permissions={campaignMissing} />}
    </SummaryCard>

    <SummaryCard title="Club-tekster" action={texts && <Link href={textsHref} className={linkClass}>Rediger stempelkort og tekster</Link>}>
      {texts ? !texts.programExists ? <p>Stempelkortet er ikke oprettet</p> : <>
        <p className="font-medium">{texts.ready ? 'Klar' : 'Mangler oplysninger'}</p>
        <p className="text-muted-foreground">Stempelkort: {texts.programActive ? 'Aktivt' : 'Ikke aktivt'}</p>
        {!texts.ready && texts.missingPlaceholders.length > 0 && <p className="text-muted-foreground">Mangler: {texts.missingPlaceholders.join(', ')}</p>}
        {!texts.ready && texts.invalidFields.length > 0 && <p className="text-muted-foreground">Ugyldige tekstfelter: {texts.invalidFields.join(', ')}</p>}
      </> : <Missing permissions={['settings']} />}
    </SummaryCard>

    {omnisend && <SummaryCard title="Omnisend" action={<Link href="/superadmin/marketing" className={linkClass}>Åbn Newsletter &amp; Omnisend</Link>}>
      <p className="font-medium">{OMNISEND_LABELS[omnisend]}</p>
    </SummaryCard>}
  </div>;
}
