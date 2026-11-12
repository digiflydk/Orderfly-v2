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
  const [apiKeys,setApiKeys]=useState({testApiKey:'',liveApiKey:''});
  const [credentialFormat,setCredentialFormat]=useState<'apiKey'|'separate'>('apiKey');
  const [errorField,setErrorField]=useState<string|undefined>();
  const [stripeKeys, setStripeKeys] = useState({ stripeTest: emptyStripe(), stripeLive: emptyStripe() });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setSettings(null); setApiKeys({testApiKey:'',liveApiKey:''}); setErrorField(undefined); setStripeKeys({ stripeTest: emptyStripe(), stripeLive: emptyStripe() }); setKeys({ test: empty(), live: empty() }); setMessage('');
    loadWorldlineSettings({ brandId, locationId }).then(value => { if (active) setSettings(value); }).catch(() => { if (active) setMessage('Betalingsopsætning kræver platformadministratoradgang. Kunne ikke hente indstillinger.'); });
    return () => { active = false; };
  }, [brandId, locationId]);
  return <section className="rounded-lg border p-6 space-y-4" aria-label="Betalingsopsætning">
    <h2 className="text-xl font-semibold">Betalingsaftale</h2>
    <p className="text-sm text-muted-foreground">Betalingsopsætningen omfatter hele aftalen. Worldline live kræver særskilt aktivering efter sandboxtest; Stripe og Worldline bruger den valgte aftale i checkout.</p>
    {!settings && !message && <p role="status">Henter indstillinger…</p>}
    {settings?.effective && <div className="rounded-md bg-muted p-4 space-y-1" aria-label="Gemt betalingsaftale">
      <p className="font-medium">Gemt aftale i checkout</p>
      <p>{settings.effective.provider === 'stripe' ? 'Stripe' : 'Worldline'} · {settings.effective.source === 'platform' ? 'Eksisterende platformaftale' : settings.effective.source === 'location' ? 'Lokationens egen aftale' : 'Brandets hovedaftale'} · {modeLabel[settings.effective.mode]}</p>
      {settings.effective.legacy && <p>Platformaftalen bruges, indtil du gemmer en ny aftale. Gemning som deaktiveret stopper online betaling.</p>}
      {!settings.effective.configured && <p role="status">Aftalen mangler. Online betaling kan ikke startes.</p>}
      {settings.effective.configured && settings.effective.mode === 'disabled' && <p>Online betaling er deaktiveret på den gemte aftale.</p>}
      {settings.effective.mode !== 'disabled' && <p>{settings.effective.credentialsSet ? 'Nøgler er registreret for det valgte miljø. Faktisk providerforbindelse skal stadig kontrolleres ved test.' : 'Det valgte miljø mangler nøgler. Der bruges ikke en anden aftale som fallback.'}</p>}
    </div>}
    {settings && <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setMessage(''); setErrorField(undefined);
      try {
        const result = await saveWorldlineSettings({ brandId, locationId }, { source: settings.source, provider: settings.provider, mode: settings.mode, revision: settings.revision, ...keys, ...stripeKeys, ...apiKeys });
        if(!result.ok){setMessage(result.message);setErrorField(result.field);return;}
        setSettings(result.settings);setApiKeys({testApiKey:'',liveApiKey:''}); setStripeKeys({ stripeTest: emptyStripe(), stripeLive: emptyStripe() }); setKeys({ test: empty(), live: empty() }); setMessage('Betalingsopsætningen er gemt.');
      } catch { setMessage('Gemningen kunne ikke bekræftes. Genindlæs betalingsopsætningen og kontrollér den gemte aftale, før du prøver igen.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-5">
        {locationId && <label className="block">Betalingsaftale<select aria-label="Betalingsaftale" className="block w-full border rounded p-2 bg-background" value={settings.source} onChange={event => setSettings({ ...settings, source: event.target.value as 'own' | 'brand' })}>
          <option value="brand">Brug brandets hovedaftale</option><option value="own">Brug lokationens egen aftale</option>
        </select></label>}
        {settings.source === 'brand' ? <p>Arver brandets aftale ({settings.brandProvider === 'stripe' ? 'Stripe' : 'Worldline'}) og miljø: <strong>{modeLabel[settings.brandMode]}</strong>. Ændringer på brandet gælder automatisk her.</p> : <>
          <label className="block">Betalingsudbyder<select className="block w-full border rounded p-2 bg-background" value={settings.provider} onChange={event => { setSettings({ ...settings, provider: event.target.value as 'stripe' | 'worldline' }); setKeys({ test: empty(), live: empty() }); setApiKeys({testApiKey:'',liveApiKey:''}); setErrorField(undefined); setStripeKeys({ stripeTest: emptyStripe(), stripeLive: emptyStripe() }); }}>
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
          {settings.provider === 'worldline' && <>
            <label className="block">Adgangsformat<select aria-label="Worldline adgangsformat" className="block w-full border rounded p-2 bg-background" value={credentialFormat} onChange={event=>{
              setCredentialFormat(event.target.value as 'apiKey'|'separate');setApiKeys({testApiKey:'',liveApiKey:''});setKeys(old=>({test:{...empty(),md5Key:old.test.md5Key},live:{...empty(),md5Key:old.live.md5Key}}));setErrorField(undefined);
            }}><option value="apiKey">Samlet API-nøgle (API key)</option><option value="separate">Merchant Number, Access Token og Secret Token</option></select></label>
            <div className="grid gap-6 md:grid-cols-2">{(['test','live'] as const).map(mode=>{
              const apiField=mode==='test'?'testApiKey':'liveApiKey';
              return <fieldset className="space-y-3 border rounded p-4" key={mode}>
                <legend>{modeLabel[mode]}-nøgler {settings[mode==='test'?'testSet':'liveSet']?'(gemt)':'(mangler)'}</legend>
                {credentialFormat==='apiKey'?<label className="block">API-nøgle (API key)<Input aria-label={`${modeLabel[mode]} API-nøgle`} aria-invalid={errorField===apiField} type="password" autoComplete="off" maxLength={4096} value={apiKeys[apiField]} onChange={event=>setApiKeys(old=>({...old,[apiField]:event.target.value}))}/></label>:
                  (['merchantNumber','accessToken','secretToken'] as const).map(key=><label className="block" key={key}>{labels[key]}<Input aria-label={`${modeLabel[mode]} ${labels[key]}`} aria-invalid={errorField===`${mode}.${key}`} type={key==='merchantNumber'?'text':'password'} autoComplete="off" maxLength={512} value={keys[mode][key]} onChange={event=>setKeys(old=>({...old,[mode]:{...old[mode],[key]:event.target.value}}))}/></label>)}
                <label className="block">MD5-nøgle til callbacks<Input aria-label={`${modeLabel[mode]} MD5-nøgle`} aria-describedby={`${mode}-md5-help`} aria-invalid={errorField===`${mode}.md5Key`} type="password" autoComplete="off" maxLength={512} value={keys[mode].md5Key} onChange={event=>setKeys(old=>({...old,[mode]:{...old[mode],md5Key:event.target.value}}))}/></label>
                <p id={`${mode}-md5-help`} className="text-sm text-muted-foreground">MD5 er en separat callbacknøgle, som ikke findes i API-nøglen. I merchant.bambora.com: Settings → Merchant numbers → Edit → MD5 key.</p>
              </fieldset>;
            })}</div>
            <p className="text-sm text-muted-foreground">Den samlede API-nøgle indeholder Merchant Number, Access Token og Secret Token. Brug den eksisterende API-adgang; du behøver ikke oprette en ny nøgle. MD5 skal være angivet, før aftalen kan bruges til betaling.</p>
          </>}
          <p className="text-sm text-muted-foreground">Nøgler gemmes i Secret Manager og vises aldrig igen. Tomme felter bevarer gemte nøgler i samme aftale og miljø. {settings.provider === 'worldline' ? 'Ved første opsætning: API-nøgle og separat MD5-nøgle, eller de tre adgangsfelter og MD5. Test og live er separate aftaler.' : 'Udfyld alle tre Stripe-felter ved første opsætning. Webhookadresse: /api/stripe/webhook.'}</p>
        </>}
        <Button type="submit">{busy ? 'Gemmer…' : 'Gem betalingsopsætning'}</Button>
      </fieldset>
    </form>}
    {message && <p role={errorField?"alert":"status"}>{message}</p>}
  </section>;
}
