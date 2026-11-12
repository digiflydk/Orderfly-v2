'use client';
import { useEffect, useState } from 'react';
import { loadWorldlineSettings, saveWorldlineSettings } from '@/app/superadmin/payments/worldline-actions';
import type { WorldlineCredentials, StripeCredentials, WorldlineScope } from '@/lib/payments/worldline-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const empty = (): WorldlineCredentials => ({ merchantNumber: '', accessToken: '', secretToken: '', md5Key: '' });
const labels: Record<keyof WorldlineCredentials, string> = { merchantNumber: 'Merchant Number', accessToken: 'Access Token', secretToken: 'Secret Token', md5Key: 'MD5-nøgle' };
const emptyStripe = (): StripeCredentials => ({ secretKey: '', publishableKey: '', webhookSecret: '' });
const modeLabel = { disabled: 'Deaktiveret', test: 'Test', live: 'Live' };
export function WorldlineSettings({ brandId, locationId }: WorldlineScope) {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof loadWorldlineSettings>> | null>(null);
  const [keys, setKeys] = useState({ test: empty(), live: empty() });
  const [stripeKeys, setStripeKeys] = useState({ stripeTest: emptyStripe(), stripeLive: emptyStripe() });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setSettings(null); setStripeKeys({ stripeTest: emptyStripe(), stripeLive: emptyStripe() }); setKeys({ test: empty(), live: empty() }); setMessage('');
    loadWorldlineSettings({ brandId, locationId }).then(value => { if (active) setSettings(value); }).catch(() => { if (active) setMessage('Betalingsopsætning kræver platformadministratoradgang. Kunne ikke hente indstillinger.'); });
    return () => { active = false; };
  }, [brandId, locationId]);
  return <section className="rounded-lg border p-6 space-y-4" aria-label="Worldline betalingsopsætning">
    <h2 className="text-xl font-semibold">Betalingsaftale</h2>
    <p className="text-sm text-muted-foreground">Betalingsopsætningen omfatter hele aftalen. Worldline live kræver særskilt aktivering efter sandboxtest; administreret levering er endnu ikke understøttet med Worldline.</p>
    {!settings && !message && <p role="status">Henter indstillinger…</p>}
    {settings && <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setMessage('');
      try {
        const updated = await saveWorldlineSettings({ brandId, locationId }, { source: settings.source, provider: settings.provider, mode: settings.mode, revision: settings.revision, ...keys, ...stripeKeys });
        setSettings(updated); setStripeKeys({ stripeTest: emptyStripe(), stripeLive: emptyStripe() }); setKeys({ test: empty(), live: empty() }); setMessage('Betalingsopsætningen er gemt.');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Kunne ikke gemme.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-5">
        {locationId && <label className="block">Betalingsaftale<select className="block w-full border rounded p-2 bg-background" value={settings.source} onChange={event => setSettings({ ...settings, source: event.target.value as 'own' | 'brand' })}>
          <option value="brand">Brug brandets hovedaftale</option><option value="own">Brug lokationens egen aftale</option>
        </select></label>}
        {settings.source === 'brand' ? <p>Arver brandets aftale ({settings.brandProvider === 'stripe' ? 'Stripe' : 'Worldline'}) og miljø: <strong>{modeLabel[settings.brandMode]}</strong>. Ændringer på brandet gælder automatisk her.</p> : <>
          <label className="block">Betalingsudbyder<select className="block w-full border rounded p-2 bg-background" value={settings.provider} onChange={event => setSettings({ ...settings, provider: event.target.value as 'stripe' | 'worldline' })}>
            <option value="stripe">Stripe</option><option value="worldline">Worldline</option>
          </select></label>
          {settings.provider === 'stripe' && <p>Gem en samlet Stripe-aftale med separate test- og live-nøgler. Nøglerne følger den valgte aftale og det valgte miljø.</p>}
          <label className="block">Miljø for aftalen<select className="block w-full border rounded p-2 bg-background" value={settings.mode} onChange={event => setSettings({ ...settings, mode: event.target.value as typeof settings.mode })}>
            <option value="disabled">Deaktiveret</option><option value="test">Test</option><option value="live">Live</option>
          </select></label>
          {settings.provider === 'stripe' && <div className="grid gap-6 md:grid-cols-2">{(['test', 'live'] as const).map(mode => {
            const field = mode === 'test' ? 'stripeTest' : 'stripeLive';
            return <fieldset className="space-y-3 border rounded p-4" key={mode}><legend>{modeLabel[mode]} Stripe {settings[mode === 'test' ? 'stripeTestSet' : 'stripeLiveSet'] ? '(gemt)' : '(mangler)'}</legend>
              {(['secretKey', 'publishableKey', 'webhookSecret'] as const).map(key => <label className="block" key={key}>{key}<Input aria-label={`${modeLabel[mode]} Stripe ${key}`} type="password" autoComplete="off" maxLength={512} value={stripeKeys[field][key]} onChange={event => setStripeKeys(old => ({...old, [field]: {...old[field], [key]: event.target.value}}))} /></label>)}
            </fieldset>;
          })}</div>}
          {settings.provider === 'worldline' && <div className="grid gap-6 md:grid-cols-2">{(['test', 'live'] as const).map(mode => <fieldset className="space-y-3 border rounded p-4" key={mode}>
            <legend>{modeLabel[mode]}-nøgler {settings[mode === 'test' ? 'testSet' : 'liveSet'] ? '(gemt)' : '(mangler)'}</legend>
            {(Object.keys(labels) as Array<keyof WorldlineCredentials>).map(key => <label className="block" key={key}>{labels[key]}<Input aria-label={`${modeLabel[mode]} ${labels[key]}`} type={key === 'merchantNumber' ? 'text' : 'password'} autoComplete="off" maxLength={512} value={keys[mode][key]} placeholder={settings[mode === 'test' ? 'testSet' : 'liveSet'] ? 'Tomt felt bevarer gemt værdi' : key === 'merchantNumber' ? mode === 'test' ? 'T…' : 'P…' : ''} onChange={event => setKeys(old => ({ ...old, [mode]: { ...old[mode], [key]: event.target.value } }))} /></label>)}
          </fieldset>)}</div>}
          <p className="text-sm text-muted-foreground">Nøgler gemmes i Secret Manager og vises aldrig igen. Udfyld alle fire felter ved første opsætning. Test og live bruger hver sit Merchant Number.</p>
        </>}
        <Button type="submit">{busy ? 'Gemmer…' : 'Gem Worldline-opsætning'}</Button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
