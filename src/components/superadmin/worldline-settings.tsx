'use client';
import { useEffect, useState } from 'react';
import { loadWorldlineSettings, saveWorldlineSettings } from '@/app/superadmin/payments/worldline-actions';
import type { WorldlineCredentials, WorldlineScope } from '@/lib/payments/worldline-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const empty = (): WorldlineCredentials => ({ merchantNumber: '', accessToken: '', secretToken: '', md5Key: '' });
const labels: Record<keyof WorldlineCredentials, string> = { merchantNumber: 'Merchant Number', accessToken: 'Access Token', secretToken: 'Secret Token', md5Key: 'MD5-nøgle' };
const modeLabel = { disabled: 'Deaktiveret', test: 'Test', live: 'Live' };
export function WorldlineSettings({ brandId, locationId }: WorldlineScope) {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof loadWorldlineSettings>> | null>(null);
  const [keys, setKeys] = useState({ test: empty(), live: empty() });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setSettings(null); setKeys({ test: empty(), live: empty() }); setMessage('');
    loadWorldlineSettings({ brandId, locationId }).then(value => { if (active) setSettings(value); }).catch(() => { if (active) setMessage('Betalingsopsætning kræver platformadministratoradgang. Kunne ikke hente indstillinger.'); });
    return () => { active = false; };
  }, [brandId, locationId]);
  return <section className="rounded-lg border p-6 space-y-4" aria-label="Worldline betalingsopsætning">
    <h2 className="text-xl font-semibold">Worldline betalingsaftale</h2>
    <p className="text-sm text-muted-foreground">Klargøring til Worldline. Checkout bruger fortsat den eksisterende betalingsintegration, indtil Worldline er tilsluttet og testet.</p>
    {!settings && !message && <p role="status">Henter indstillinger…</p>}
    {settings && <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setMessage('');
      try {
        const updated = await saveWorldlineSettings({ brandId, locationId }, { source: settings.source, provider: settings.provider, mode: settings.mode, revision: settings.revision, ...keys });
        setSettings(updated); setKeys({ test: empty(), live: empty() }); setMessage('Worldline-opsætningen er gemt. Checkout er endnu ikke skiftet.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Kunne ikke gemme.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-5">
        {locationId && <label className="block">Betalingsaftale<select className="block w-full border rounded p-2 bg-background" value={settings.source} onChange={event => setSettings({ ...settings, source: event.target.value as 'own' | 'brand' })}>
          <option value="brand">Brug brandets hovedaftale</option><option value="own">Brug lokationens egen aftale</option>
        </select></label>}
        {settings.source === 'brand' ? <p>Arver brandets aftale ({settings.brandProvider === 'stripe' ? 'Stripe' : 'Worldline'}) og Worldline-miljø: <strong>{modeLabel[settings.brandMode]}</strong>. Ændringer på brandet gælder automatisk her.</p> : <>
          <label className="block">Betalingsudbyder<select className="block w-full border rounded p-2 bg-background" value={settings.provider} onChange={event => setSettings({ ...settings, provider: event.target.value as 'stripe' | 'worldline' })}>
            <option value="stripe">Stripe</option><option value="worldline">Worldline</option>
          </select></label>
          {settings.provider === 'stripe' && <p>Stripe bruger fortsat platformens eksisterende betalingsopsætning. Worldline-nøglerne nedenfor kan klargøres separat.</p>}
          <label className="block">Miljø for Worldline-aftalen<select className="block w-full border rounded p-2 bg-background" value={settings.mode} onChange={event => setSettings({ ...settings, mode: event.target.value as typeof settings.mode })}>
            <option value="disabled">Deaktiveret</option><option value="test">Test</option><option value="live">Live</option>
          </select></label>
          <div className="grid gap-6 md:grid-cols-2">{(['test', 'live'] as const).map(mode => <fieldset className="space-y-3 border rounded p-4" key={mode}>
            <legend>{modeLabel[mode]}-nøgler {settings[mode === 'test' ? 'testSet' : 'liveSet'] ? '(gemt)' : '(mangler)'}</legend>
            {(Object.keys(labels) as Array<keyof WorldlineCredentials>).map(key => <label className="block" key={key}>{labels[key]}<Input aria-label={`${modeLabel[mode]} ${labels[key]}`} type={key === 'merchantNumber' ? 'text' : 'password'} autoComplete="off" maxLength={512} value={keys[mode][key]} placeholder={settings[mode === 'test' ? 'testSet' : 'liveSet'] ? 'Tomt felt bevarer gemt værdi' : key === 'merchantNumber' ? mode === 'test' ? 'T…' : 'P…' : ''} onChange={event => setKeys(old => ({ ...old, [mode]: { ...old[mode], [key]: event.target.value } }))} /></label>)}
          </fieldset>)}</div>
          <p className="text-sm text-muted-foreground">Nøgler gemmes i Secret Manager og vises aldrig igen. Udfyld alle fire felter ved første opsætning. Test og live bruger hver sit Merchant Number.</p>
        </>}
        <Button type="submit">{busy ? 'Gemmer…' : 'Gem Worldline-opsætning'}</Button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
