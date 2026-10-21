'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { campaignSettingsSchema, PROFILE_BONUS_FIELDS, type CampaignDoc, type CampaignSettings } from '@/lib/loyalty/stamp-card/campaign-rules';
import { loadClubCampaignAction, saveClubCampaignAction } from './club-campaign-actions';

const fieldLabels = { phone: 'Telefonnummer', birthDate: 'Fødselsdato', gender: 'Køn' };
const inputClass = 'min-h-11 w-full rounded-md border bg-background px-3 py-2';
const errorText = (code: string) => code === 'campaign_changed' ? 'Indstillingerne er ændret af en anden. Genindlæs før du gemmer igen.'
  : code === 'forbidden' || code === 'unauthorized' ? 'Du har ikke adgang til at administrere Club-kampagner for dette brand.'
    : code === 'campaign_invalid' ? 'Den gemte kampagne kan ikke læses. Kontakt en administrator.'
      : code === 'invalid_request' ? 'Kontrollér stempelantal, profilfelter og kampagneperioder.' : 'Kampagnen kunne ikke gemmes. Prøv igen.';
function dateInput(epoch: number | null) {
  if (epoch === null || !Number.isFinite(epoch)) return '';
  const date = new Date(epoch);
  return new Date(epoch - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const dateValue = (value: string) => value ? new Date(value).getTime() : null;

export function ClubCampaignPanel({ brands }: { brands: Array<{ id: string; name: string }> }) {
  const [brandId, setBrandId] = useState(''), [campaign, setCampaign] = useState<CampaignDoc | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const request = useRef(0);
  async function load(id: string) {
    const current = ++request.current;
    setCampaign(null); setMessage(null);
    if (!id) { setBusy(false); return; }
    setBusy(true);
    const result = await loadClubCampaignAction(id);
    if (current !== request.current) return;
    setBusy(false);
    if (result.ok) setCampaign(result.campaign); else setMessage({ error: true, text: errorText(result.error) });
  }
  useEffect(() => { void load(brandId); }, [brandId]);
  function update(settings: CampaignSettings) { setCampaign(value => value ? { ...value, settings } : value); setMessage(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!campaign || busy) return;
    if (!campaignSettingsSchema.safeParse(campaign.settings).success) { setMessage({ error: true, text: errorText('invalid_request') }); return; }
    setBusy(true); setMessage(null);
    const current = request.current, id = brandId;
    const result = await saveClubCampaignAction({ brandId: id, version: campaign.version, settings: campaign.settings });
    if (current !== request.current) return;
    setBusy(false);
    if (result.ok) { setCampaign(result.campaign); setMessage({ error: false, text: 'Club-kampagner er gemt.' }); }
    else setMessage({ error: true, text: errorText(result.error) });
  }
  return <section aria-labelledby="club-campaign-admin" className="space-y-4 rounded-lg border p-4 sm:p-6">
    <div><h2 id="club-campaign-admin" className="text-xl font-semibold">Club-kampagner</h2>
      <p className="text-sm text-muted-foreground">Vælg tilbuddet i checkout og belønninger for Club-medlemmer. Rabatprocenten oprettes som en Club-tilmeldingsrabat i rabatlisten.</p></div>
    <label className="block max-w-md space-y-1"><span>Brand for Club-kampagner</span><select className={inputClass} value={brandId} disabled={busy} onChange={event => setBrandId(event.target.value)}>
      <option value="">Vælg brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
    </select></label>
    {busy && <p role="status">Henter eller gemmer kampagne…</p>}
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-destructive' : ''}>{message.text}</p>}
    {campaign && <form aria-label="Indstillinger for Club-kampagner" onSubmit={save} className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <label className="block max-w-md space-y-1"><span>Tilmeldingstilbud i checkout</span><select className={inputClass} value={campaign.settings.checkoutMode} onChange={event => update({ ...campaign.settings, checkoutMode: event.target.value as CampaignSettings['checkoutMode'] })}>
          <option value="none">Ingen tilmeldingskampagne</option><option value="newsletter">Nyhedsbrev</option><option value="club">Club</option>
        </select></label>
        <p className="text-sm text-muted-foreground">Tidspunkter vises i din lokale tid. Checkout viser højst én tilmeldingsmulighed. Club-tilmelding på Club-siden bruger samme personlige engangsfordel.</p>
        {(['welcome', 'profile'] as const).map(kind => {
          const value = campaign.settings[kind];
          const patch = (changes: Partial<typeof value>) => update({ ...campaign.settings, [kind]: { ...value, ...changes } });
          return <fieldset key={kind} className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 font-semibold">{kind === 'welcome' ? 'Velkomststempel' : 'Stempel for udfyldt profil'}</legend>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span>{kind === 'welcome' ? 'Aktivér velkomststempler' : 'Aktivér profilbonus'}</span></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1"><span>Antal {kind === 'welcome' ? 'velkomststempler' : 'profilstempler'}</span><input className={inputClass} type="number" min={kind === 'welcome' ? 0 : 1} max={8} step={1} value={value.stamps} onChange={event => patch({ stamps: event.target.valueAsNumber })} /></label>
              <label className="space-y-1"><span>Start på {kind === 'welcome' ? 'velkomstkampagne' : 'profilkampagne'}</span><input className={inputClass} type="datetime-local" value={dateInput(value.startsAt)} onChange={event => patch({ startsAt: dateValue(event.target.value) })} /></label>
              <label className="space-y-1"><span>Slut på {kind === 'welcome' ? 'velkomstkampagne' : 'profilkampagne'}</span><input className={inputClass} type="datetime-local" value={dateInput(value.endsAt)} onChange={event => patch({ endsAt: dateValue(event.target.value) })} /></label>
            </div>
            {kind === 'profile' && <fieldset><legend className="text-sm font-medium">Profilfelter der udløser bonus</legend><div className="flex flex-wrap gap-5">{PROFILE_BONUS_FIELDS.map(field => <label key={field} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={campaign.settings.profile.requiredFields.includes(field)} onChange={event => update({ ...campaign.settings, profile: { ...campaign.settings.profile, requiredFields: event.target.checked ? [...campaign.settings.profile.requiredFields, field] : campaign.settings.profile.requiredFields.filter(known => known !== field) } })} /><span>{fieldLabels[field]}</span></label>)}</div><p className="text-sm text-muted-foreground">Vælg mindst ét felt. “Ønsker ikke at oplyse” tæller som et svar på køn.</p></fieldset>}
          </fieldset>;
        })}
      </fieldset>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy}>Gem Club-kampagner</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void load(brandId)}>Genindlæs</Button></div>
    </form>}
  </section>;
}
