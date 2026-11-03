'use client';

import { useEffect, useRef, useState } from 'react';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { campaignSettingsSchema, PROFILE_BONUS_FIELDS, type CampaignDoc, type CampaignSettings } from '@/lib/loyalty/stamp-card/campaign-rules';
import { loadClubCampaignAction, saveClubCampaignAction } from './club-campaign-actions';

const fieldLabels = { phone: 'Telefonnummer', birthDate: 'Fødselsdato', gender: 'Køn' };
const inputClass = 'min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm';
const errorText = (code: string) => code === 'campaign_changed' ? 'Indstillingerne er ændret af en anden. Annullér ændringerne for at hente den nyeste version.'
  : code === 'forbidden' || code === 'unauthorized' ? 'Du har ikke adgang til at administrere kampagnen for dette brand.'
    : code === 'campaign_invalid' ? 'Den gemte kampagne kan ikke læses. Kontakt en administrator.'
      : code === 'invalid_request' ? 'Kontrollér stempelantal, profilfelter og kampagneperioder.' : 'Kampagnen kunne ikke gemmes. Prøv igen.';
const CAMPAIGN_TIMEZONE = 'Europe/Copenhagen';
function dateInput(epoch: number | null) {
  return epoch === null || !Number.isFinite(epoch) ? '' : formatInTimeZone(epoch, CAMPAIGN_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
function dateValue(value: string) {
  if (!value) return null;
  const instant = fromZonedTime(value, CAMPAIGN_TIMEZONE).getTime();
  // A spring DST gap has no matching Danish wall-clock instant. Keep it invalid
  // rather than silently shifting the administrator's chosen campaign period.
  return Number.isFinite(instant) && dateInput(instant) === value ? instant : Number.NaN;
}
const MODES = [
  ['none', 'Ingen', 'Ingen tilmelding i checkout'],
  ['newsletter', 'Nyhedsbrev', 'Kun samtykke til nyhedsbrev'],
  ['club', 'Club', 'Medlemskab, stempler og nyhedsbrev'],
] as const;

export type CampaignPreview = { programName: string; newsletterText: string };

// Edits one brand's checkout offer (step 3) and signup stamps (step 5). The
// discount step is rendered by the page between them as `children`.
export function ClubCampaignPanel({ brandId, preview, children }: { brandId: string; preview: CampaignPreview; children?: React.ReactNode }) {
  const [campaign, setCampaign] = useState<CampaignDoc | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const request = useRef(0);
  async function load() {
    const current = ++request.current;
    setCampaign(null); setMessage(null); setBusy(true);
    const result = await loadClubCampaignAction(brandId).catch(() => ({ ok: false as const, error: 'unavailable' }));
    if (current !== request.current) return;
    setBusy(false);
    if (result.ok) setCampaign(result.campaign);
    else setMessage({ error: true, text: result.error === 'unavailable' ? 'Kampagnen kunne ikke hentes. Prøv igen.' : errorText(result.error) });
  }
  useEffect(() => { void load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps
  function update(settings: CampaignSettings) { setCampaign(value => value ? { ...value, settings } : value); setMessage(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign || busy) return;
    if (!campaignSettingsSchema.safeParse(campaign.settings).success) { setMessage({ error: true, text: errorText('invalid_request') }); return; }
    setBusy(true); setMessage(null);
    const current = request.current;
    const result = await saveClubCampaignAction({ brandId, version: campaign.version, settings: campaign.settings })
      .catch(() => ({ ok: false as const, error: 'unavailable' }));
    if (current !== request.current) return;
    setBusy(false);
    if (result.ok) { setCampaign(result.campaign); setMessage({ error: false, text: 'Kampagnen er gemt.' }); }
    else setMessage({ error: true, text: errorText(result.error) });
  }

  if (!campaign) return <section aria-label="Kampagne" className="rounded-lg border bg-white p-6">
    {busy && <p role="status" className="text-sm text-muted-foreground">Henter kampagne…</p>}
    {message && <p role="alert" className="text-sm text-destructive">{message.text}</p>}
  </section>;

  const s = campaign.settings;
  const welcomeStamps = s.welcome.enabled && s.welcome.stamps > 0 ? s.welcome.stamps : 0;
  return <form aria-label="Indstillinger for Club-kampagner" onSubmit={save} className="space-y-4">
    <fieldset disabled={busy} className="contents">
      <section id="checkout" aria-labelledby="step-checkout" className="scroll-mt-6 space-y-4 rounded-lg border bg-white p-5 sm:p-6">
        <div className="space-y-1">
          <h2 id="step-checkout" className="text-base font-semibold">3 · Tilbud i checkout</h2>
          <p className="text-sm text-muted-foreground">Checkout viser højst én tilmelding. Personlige rabatter, kunder allerede har fået, virker stadig.</p>
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">Tilbud i checkout</legend>
          {MODES.map(([value, label, help]) => <label key={value}
            className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-4', s.checkoutMode === value && 'border-2 border-primary bg-primary/5')}>
            <input type="radio" name="checkout-mode" value={value} checked={s.checkoutMode === value} aria-describedby={`mode-${value}-help`}
              onChange={() => update({ ...s, checkoutMode: value })} className="mt-0.5 h-4 w-4" />
            <span className="space-y-0.5"><span className="block text-sm font-semibold">{label}</span>
              <span id={`mode-${value}-help`} className="block text-sm text-muted-foreground">{help}</span></span>
          </label>)}
        </fieldset>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sådan ser kunden det</h3>
          <div aria-label="Forhåndsvisning af checkout" role="group" className="max-w-lg space-y-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
            {s.checkoutMode === 'none' && <p className="text-muted-foreground">Checkout viser ingen tilmelding.</p>}
            {s.checkoutMode === 'newsletter' && <label className="flex items-start gap-3"><input type="checkbox" disabled className="mt-0.5 h-4 w-4" />{preview.newsletterText}</label>}
            {s.checkoutMode === 'club' && <>
              <p className="font-semibold">Bliv medlem af {preview.programName}</p>
              {welcomeStamps > 0 && <p className="text-muted-foreground">Du får {welcomeStamps} {welcomeStamps === 1 ? 'velkomststempel' : 'velkomststempler'} ved tilmelding.</p>}
              <label className="flex items-start gap-3"><input type="checkbox" disabled className="mt-0.5 h-4 w-4" />Samtykke til nyhedsbrev (Club-teksten)</label>
              <label className="flex items-start gap-3"><input type="checkbox" disabled className="mt-0.5 h-4 w-4" />Accept af Club-vilkår</label>
            </>}
          </div>
        </div>
      </section>

      {children}

      <section id="stempler" aria-labelledby="step-stamps" className="scroll-mt-6 space-y-4 rounded-lg border bg-white p-5 sm:p-6">
        <div className="space-y-1">
          <h2 id="step-stamps" className="text-base font-semibold">5 · Stempler ved tilmelding</h2>
          <p className="text-sm text-muted-foreground">Alle tider er dansk tid. Tom periode betyder altid.</p>
        </div>
        {(['welcome', 'profile'] as const).map(kind => {
          const value = s[kind], welcome = kind === 'welcome';
          const patch = (changes: Partial<typeof value>) => update({ ...s, [kind]: { ...value, ...changes } });
          return <fieldset key={kind} className="space-y-3 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
            <legend className="sr-only">{welcome ? 'Velkomststempel' : 'Stempel for udfyldt profil'}</legend>
            <div className="flex items-center gap-3">
              <Switch id={`${kind}-enabled`} checked={value.enabled} onCheckedChange={checked => patch({ enabled: checked })} />
              <label htmlFor={`${kind}-enabled`} className="text-sm font-semibold">{welcome ? 'Aktivér velkomststempler' : 'Aktivér profilbonus'}</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm"><span>Antal {welcome ? 'velkomststempler' : 'profilstempler'}</span><input className={inputClass} type="number" min={welcome ? 0 : 1} max={8} step={1} value={value.stamps} onChange={event => patch({ stamps: event.target.valueAsNumber })} /></label>
              <label className="space-y-1 text-sm"><span>Start på {welcome ? 'velkomstkampagne' : 'profilkampagne'}</span><input className={inputClass} type="datetime-local" value={dateInput(value.startsAt)} onChange={event => patch({ startsAt: dateValue(event.target.value) })} /></label>
              <label className="space-y-1 text-sm"><span>Slut på {welcome ? 'velkomstkampagne' : 'profilkampagne'}</span><input className={inputClass} type="datetime-local" value={dateInput(value.endsAt)} onChange={event => patch({ endsAt: dateValue(event.target.value) })} /></label>
            </div>
            {!welcome && <fieldset className="space-y-1"><legend className="text-sm font-medium">Profilfelter der udløser bonus</legend>
              <div className="flex flex-wrap gap-5">{PROFILE_BONUS_FIELDS.map(field => <label key={field} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={s.profile.requiredFields.includes(field)} onChange={event => update({ ...s, profile: { ...s.profile, requiredFields: event.target.checked ? [...s.profile.requiredFields, field] : s.profile.requiredFields.filter(known => known !== field) } })} /><span>{fieldLabels[field]}</span></label>)}</div>
              <p className="text-sm text-muted-foreground">Vælg mindst ét felt. “Ønsker ikke at oplyse” tæller som et svar på køn.</p></fieldset>}
          </fieldset>;
        })}
      </section>
    </fieldset>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4">
      <div className="text-sm">
        {message ? <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-destructive' : 'text-green-800'}>{message.text}</p>
          : <p className="text-muted-foreground">Ændringer i trin 3 og 5 gemmes først, når du trykker Gem.</p>}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>Annullér ændringer</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Gemmer…' : 'Gem ændringer'}</Button>
      </div>
    </div>
  </form>;
}
