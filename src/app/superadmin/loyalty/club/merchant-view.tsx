import { formatInTimeZone } from 'date-fns-tz';
import { AlertTriangle, Check } from 'lucide-react';
import Link from '@/components/superadmin/admin-link';
import { cn } from '@/lib/utils';
import type { ClubAdminPermission, ClubAdminSummary, ClubSuppressedReason, DiscountInactiveReason } from '@/lib/loyalty/stamp-card/club-admin-summary';
import { discountValueLabel } from './overview-row';

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
const MODE_LABELS = { none: 'Ingen', newsletter: 'Nyhedsbrev', club: 'Club' } as const;
const date = (epoch: number) => formatInTimeZone(epoch, 'Europe/Copenhagen', 'dd-MM-yyyy');
const linkClass = 'inline-flex min-h-10 items-center text-sm font-semibold text-foreground underline underline-offset-4';

export const missingPermissionText = (missing: ClubAdminPermission[]) => `Kræver: ${missing.map(permission => PERMISSION_LABELS[permission]).join(' og ')}`;
export const campaignMissing = (summary: ClubAdminSummary) => (['settings', 'discountsEdit'] as const).filter(permission => !summary.permissions[permission]);

type StepState = 'ok' | 'warn' | 'off';
export type Step = { n: number; id: string; title: string; summary: string; state: StepState };

export function merchantSteps(summary: ClubAdminSummary): Step[] {
  const { texts, campaign, discounts } = summary;
  const noAccess = (n: number, id: string, title: string): Step => ({ n, id, title, summary: 'Ingen adgang', state: 'off' });
  const usedDiscount = discounts?.find(discount => discount.usedInCheckout);
  const bonus = (value: { enabled: boolean; stamps: number }) => value.enabled ? String(value.stamps) : 'fra';
  const steps: Step[] = [
    texts ? { n: 1, id: 'stempelkort', title: 'Stempelkort', summary: !texts.programExists ? 'Ikke oprettet' : texts.programActive ? 'Aktivt' : 'Ikke aktivt',
      state: texts.programExists && texts.programActive ? 'ok' : 'warn' } : noAccess(1, 'stempelkort', 'Stempelkort'),
    texts ? { n: 2, id: 'tekster', title: 'Club-tekster', summary: texts.ready ? 'Klar' : 'Mangler oplysninger', state: texts.ready ? 'ok' : 'warn' }
      : noAccess(2, 'tekster', 'Club-tekster'),
    { n: 3, id: 'checkout', title: 'Tilbud i checkout', summary: MODE_LABELS[summary.checkoutMode] + (summary.checkoutMode === 'club' && !summary.live ? ' · vises ikke' : ''),
      state: summary.live ? 'ok' : summary.checkoutMode === 'none' ? 'off' : 'warn' },
    discounts === null ? noAccess(4, 'rabat', 'Tilmeldingsrabat')
      : { n: 4, id: 'rabat', title: 'Tilmeldingsrabat', summary: usedDiscount ? discountValueLabel(usedDiscount) : 'Ingen · valgfri', state: usedDiscount ? 'ok' : 'off' },
    campaign ? { n: 5, id: 'stempler', title: 'Stempler', summary: `Velkomst ${bonus(campaign.welcome)} · Profil ${bonus(campaign.profile)}`,
      state: campaign.welcome.enabled || campaign.profile.enabled ? 'ok' : 'off' } : noAccess(5, 'stempler', 'Stempler'),
  ];
  if (summary.omnisend) steps.push({ n: 6, id: 'omnisend', title: 'Omnisend', summary: summary.omnisend === 'connected' ? 'Forbundet' : 'Ikke aktiv',
    state: summary.omnisend === 'connected' ? 'ok' : 'warn' });
  return steps;
}

export function merchantWarnings(summary: ClubAdminSummary): Array<{ alert: boolean; title: string; text: string; href?: string; action?: string }> {
  const warnings: Array<{ alert: boolean; title: string; text: string; href?: string; action?: string }> = [];
  const { campaign, discounts } = summary;
  if (campaign?.invalid) warnings.push({ alert: true, title: 'Den gemte kampagne kan ikke læses', text: 'Kontakt en administrator, før kampagnen ændres.' });
  if (campaign?.clubSuppressed) warnings.push({ alert: true, title: 'Club vises ikke i checkout',
    text: `Tilbuddet er sat til Club, men ${SUPPRESSED_LABELS[campaign.clubSuppressed]}.`, href: '#stempelkort', action: 'Se stempelkort' });
  if (summary.checkoutMode === 'club' && summary.live && discounts && !discounts.some(discount => discount.usedInCheckout)) {
    const stamps = campaign?.welcome.activeNow ? campaign.welcome.stamps : 0;
    warnings.push({ alert: false, title: 'Club tilbydes i checkout uden tilmeldingsrabat',
      text: stamps ? `Nye medlemmer får kun ${stamps} ${stamps === 1 ? 'velkomststempel' : 'velkomststempler'}. Det er gyldigt, men tjek at det er bevidst.`
        : 'Nye medlemmer får hverken rabat eller velkomststempel. Det er gyldigt, men tjek at det er bevidst.',
      href: '#rabat', action: 'Se tilmeldingsrabat' });
  }
  return warnings;
}

export function MerchantHeader({ summary }: { summary: ClubAdminSummary }) {
  return <div className="space-y-2">
    <Link href="/superadmin/loyalty/club" className="inline-flex min-h-8 items-center text-sm text-muted-foreground hover:text-foreground">← Alle kampagner</Link>
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{summary.brandName}</h1>
      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', summary.live ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground')}>
        {summary.live ? 'Live' : 'Ikke live'}
      </span>
    </div>
    <p className="text-sm text-muted-foreground">Club &amp; nyhedsbrev · {summary.createdAt ? `Oprettet ${date(summary.createdAt)}` : 'Ikke oprettet endnu'}</p>
  </div>;
}

export function Warnings({ summary }: { summary: ClubAdminSummary }) {
  const warnings = merchantWarnings(summary);
  if (!warnings.length) return null;
  return <div className="space-y-3">{warnings.map(warning =>
    <div key={warning.title} role={warning.alert ? 'alert' : 'note'}
      className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4', warning.alert ? 'border-destructive/40 bg-destructive/5' : 'border-amber-300 bg-amber-50')}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 flex-none', warning.alert ? 'text-destructive' : 'text-amber-700')} aria-hidden="true" />
        <div className="text-sm"><p className="font-semibold">{warning.title}</p><p>{warning.text}</p></div>
      </div>
      {warning.href && <a href={warning.href} className="inline-flex min-h-10 items-center rounded-md border border-amber-700/50 px-3 text-sm font-semibold">{warning.action}</a>}
    </div>)}</div>;
}

export function Stepper({ steps }: { steps: Step[] }) {
  return <nav aria-label="Opsætningstrin" className="rounded-lg border bg-white p-2">
    <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opsætning</p>
    <ol>{steps.map(step => <li key={step.id}>
      <a href={`#${step.id}`} className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
        <span aria-hidden="true" className={cn('inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold',
          step.state === 'ok' ? 'bg-green-100 text-green-800' : step.state === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground')}>
          {step.state === 'ok' ? <Check className="h-4 w-4" /> : step.n}
        </span>
        <span className="min-w-0"><span className="block text-sm font-semibold">{step.title}</span>
          <span className={cn('block text-xs', step.state === 'warn' ? 'text-amber-800' : 'text-muted-foreground')}>{step.summary}</span></span>
        <span className="sr-only">{step.state === 'ok' ? '(klar)' : step.state === 'warn' ? '(kræver handling)' : ''}</span>
      </a>
    </li>)}</ol>
  </nav>;
}

function Section({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section id={id} aria-labelledby={`step-${id}`} className="scroll-mt-6 flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-white p-5 sm:p-6">
    <div className="min-w-0 space-y-1"><h2 id={`step-${id}`} className="text-base font-semibold">{title}</h2><div className="text-sm text-muted-foreground">{children}</div></div>
    {action}
  </section>;
}
const Missing = ({ permissions }: { permissions: ClubAdminPermission[] }) => <p role="note">{missingPermissionText(permissions)}</p>;

export function ProgramSections({ summary }: { summary: ClubAdminSummary }) {
  const { texts } = summary;
  const href = `/superadmin/loyalty/stamp-card?tab=settings&edit=${encodeURIComponent(summary.brandId)}`;
  return <>
    <Section id="stempelkort" title="1 · Stempelkort" action={texts && <Link href={href} className={linkClass}>Rediger stempelkort →</Link>}>
      {texts ? <p>{!texts.programExists ? 'Stempelkortet er ikke oprettet' : `${summary.programName} · ${texts.programActive ? 'Aktivt' : 'Ikke aktivt'}`}</p> : <Missing permissions={['settings']} />}
    </Section>
    <Section id="tekster" title="2 · Club-tekster og vilkår" action={texts && <Link href={href} className={linkClass}>Se tekster →</Link>}>
      {texts ? <>
        <p className={texts.ready ? 'text-green-800' : 'text-amber-800'}>{texts.ready ? 'Klar · alle brandoplysninger er udfyldt' : 'Mangler oplysninger'}</p>
        {!texts.ready && texts.missingPlaceholders.length > 0 && <p>Mangler: {texts.missingPlaceholders.join(', ')}</p>}
        {!texts.ready && texts.invalidFields.length > 0 && <p>Ugyldige tekstfelter: {texts.invalidFields.join(', ')}</p>}
      </> : <Missing permissions={['settings']} />}
    </Section>
  </>;
}

export function DiscountSection({ summary }: { summary: ClubAdminSummary }) {
  const { discounts, permissions } = summary;
  return <section id="rabat" aria-labelledby="step-rabat" className="scroll-mt-6 space-y-4 rounded-lg border bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1"><h2 id="step-rabat" className="text-base font-semibold">4 · Tilmeldingsrabat</h2>
        <p className="text-sm text-muted-foreground">Valgfri. Gives én gang til nye tilmeldinger.</p></div>
      <div className="flex flex-wrap gap-3">
        {permissions.discountsView && <Link href="/superadmin/discounts" className={linkClass}>Se rabatter</Link>}
        {permissions.discountsCreate && <Link href="/superadmin/discounts/new" className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Opret tilmeldingsrabat</Link>}
      </div>
    </div>
    {discounts === null ? <Missing permissions={['discountsView']} />
      : discounts.length ? <ul className="divide-y rounded-md border">{discounts.map(discount => <li key={discount.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <span><span className="font-semibold">{discount.applicationType === 'club_signup' ? 'Club' : 'Nyhedsbrev'}</span> · {discountValueLabel(discount)}{discount.description ? ` · ${discount.description}` : ''}{discount.endsAt ? ` · til ${date(discount.endsAt)}` : ''}</span>
          <span className={cn('text-xs font-semibold', discount.usedInCheckout ? 'text-green-800' : 'text-amber-800')}>{discount.inactiveReason ? INACTIVE_LABELS[discount.inactiveReason] : 'Bruges i checkout'}</span>
        </li>)}</ul>
        : <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Ingen aktiv tilmeldingsrabat</p>}
  </section>;
}

export function ReadOnlyCampaign({ summary, missing }: { summary: ClubAdminSummary; missing: ClubAdminPermission[] }) {
  return <>
    <Section id="checkout" title="3 · Tilbud i checkout"><p className="font-semibold text-foreground">{MODE_LABELS[summary.checkoutMode]}</p><Missing permissions={missing} /></Section>
    <DiscountSection summary={summary} />
    <Section id="stempler" title="5 · Stempler ved tilmelding"><Missing permissions={missing} /></Section>
  </>;
}

export function OmnisendSection({ summary }: { summary: ClubAdminSummary }) {
  if (!summary.omnisend) return null;
  const labels = { connected: 'Forbundet · samtykker synkroniseres', disabled: 'Slået fra for brandet', not_configured: 'Ikke sat op', invalid: 'Opsætningen er ugyldig' };
  return <Section id="omnisend" title="6 · Omnisend (kun superadmin)" action={<Link href="/superadmin/marketing" className={linkClass}>Åbn Newsletter &amp; Omnisend →</Link>}>
    <p className={summary.omnisend === 'connected' ? 'text-green-800' : 'text-amber-800'}>{labels[summary.omnisend]}</p>
  </Section>;
}
