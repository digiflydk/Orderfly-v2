'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importGameCodes, saveScratchCardDraft, sendGameTestEmail, setScratchCardStatus, uploadGameAsset } from '@/app/superadmin/games/actions';
import { esmeraldaScratchTest, prizeChannels, scratchCardDraftSchema, type ScratchCardDraft } from '@/lib/games/scratch-card';
import { ScratchGame } from './ScratchGame';

type Prize = ScratchCardDraft['prizes'][number];
type Step = 'game' | 'prizes' | 'design' | 'publish';
const steps: { id: Step; title: string; description: string }[] = [
  { id: 'game', title: '1. Spillet', description: 'Tekster, lodder og tilmelding' },
  { id: 'prizes', title: '2. Præmier', description: 'Gevinster og vinderchancer' },
  { id: 'design', title: '3. Udseende', description: 'Logo, billeder og farver' },
  { id: 'publish', title: '4. Test og udgiv', description: 'Placering, koder og status' },
];
const starter: Prize = { name: 'Testpræmie', imageUrl: '', type: 'item', value: 0, probabilityPercent: 10, maxWinners: 100, codeMode: 'generated', redemption: 'restaurant' };
const recommendedFields = (prizeCount: number) => Math.min(3, Math.max(1, Math.ceil(prizeCount / 2))) * 3;
const input = 'mt-1 w-full min-w-0 rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900';

export function ScratchCardEditor({ brands, products = [], brandId, draft, status = 'draft', preset = false }: { brands: Array<{ id: string; name: string; slug: string; logoUrl: string }>; products?:Array<{id:string;name:string}>; brandId: string; draft: ScratchCardDraft | null; status?: string; preset?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<Step>('game');
  const [game, setGame] = useState<ScratchCardDraft>(draft || scratchCardDraftSchema.parse({ brandId, title: 'Skrab og vind', instruction: 'Skrab felterne og se din gevinst.', revealText: 'Ingen gevinst denne gang', prizes: [starter], placement: 'selected', paths: ['/'] }));
  const [manualTickets, setManualTickets] = useState(false);
  const [codes, setCodes] = useState('');
  const [testEmail,setTestEmail]=useState('');
  const [embedSnippet,setEmbedSnippet]=useState('');
  const [codePrize, setCodePrize] = useState(0);
  const [mobile, setMobile] = useState(true);
  const brand = brands.find(b => b.id === brandId);
  const chance = game.prizes.reduce((total, prize) => total + prize.probabilityPercent, 0);

  function update<K extends keyof ScratchCardDraft>(key: K, value: ScratchCardDraft[K]) {
    setGame(current => ({ ...current, [key]: value }));
  }
  function changePrize(index: number, change: Partial<Prize>) {
    setGame(current => ({ ...current, prizes: current.prizes.map((prize, i) => i === index ? { ...prize, ...change } : prize) }));
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveScratchCardDraft(data);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  async function asset(kind: 'logo' | 'background' | 'font' | 'prize', file: File, index?: number) {
    const data = new FormData();
    data.set('brandId', brandId);
    data.set('kind', kind);
    data.set('file', file);
    const result = await uploadGameAsset(data);
    setMessage(result.message);
    if (result.ok && result.url) {
      if (kind === 'prize' && index !== undefined) changePrize(index, { imageUrl: result.url });
      else update(kind === 'logo' ? 'logoUrl' : kind === 'font' ? 'fontUrl' : 'backgroundUrl', result.url);
    }
  }
  const upload = (kind: 'logo' | 'background' | 'font' | 'prize', index?: number) => <input type="file" aria-label={`Upload ${kind === 'prize' ? `billede til præmie ${Number(index) + 1}` : kind === 'logo' ? 'logo' : kind === 'font' ? 'skrifttype' : 'baggrundsbillede'}`} accept={kind === 'font' ? '.woff2,font/woff2' : 'image/jpeg,image/png,image/webp'} className="mt-2 block w-full text-xs" onChange={event => { const file = event.target.files?.[0]; if (file) void asset(kind, file, index); }} />;
  const addPrize = () => setGame(current => {
    const prizes = [...current.prizes, { ...starter, name: `Præmie ${current.prizes.length + 1}` }];
    return { ...current, prizes, cardsPerPlay: manualTickets ? current.cardsPerPlay : recommendedFields(prizes.length) };
  });
  const removePrize = (index: number) => setGame(current => {
    const prizes = current.prizes.filter((_, i) => i !== index);
    return { ...current, prizes, cardsPerPlay: manualTickets ? current.cardsPerPlay : recommendedFields(prizes.length) };
  });

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
    <div className="min-w-0 space-y-5">
      <div className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kampagne</p><h2 className="text-lg font-semibold">{brand?.name || brandId}</h2></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === 'live' ? 'bg-green-100 text-green-800' : status === 'test' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{status === 'live' ? 'Live' : status === 'test' ? 'Kun test' : 'Kladde'}</span>
        </div>
        <label className="mt-4 block text-sm font-medium">Vælg brand<select className={input} value={brandId} onChange={event => router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(event.target.value)}`)}>{brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {preset && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">Esmeralda-eksemplet er indlæst. Gem opsætningen før du tester.</p>}
        {brand?.slug === 'esmeralda' && <button type="button" className="mt-3 text-left text-sm font-medium underline underline-offset-2" onClick={() => { setGame(esmeraldaScratchTest(brandId)); setManualTickets(false); setMessage('Esmeralda-eksemplet er indlæst. Gem opsætningen.'); }}>Gendan Esmeralda-eksempel med Pizza, Tiramisu og pommes frites</button>}
      </div>

      <nav aria-label="Opsætning af skrabelod" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map(item => <button key={item.id} type="button" aria-current={step === item.id ? 'step' : undefined} onClick={() => setStep(item.id)} className={`rounded-lg border p-3 text-left text-sm transition-colors ${step === item.id ? 'border-gray-900 bg-gray-900 font-semibold text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-500'}`}>{item.title}</button>)}</nav>

      <form noValidate onSubmit={save} className="rounded-xl border bg-white p-4 sm:p-6">
        <input type="hidden" name="brandId" value={brandId} />
        <header className="mb-6 border-b pb-4"><h2 className="text-xl font-semibold">{steps.find(item => item.id === step)?.title}</h2><p className="mt-1 text-sm text-gray-600">{steps.find(item => item.id === step)?.description}</p></header>

        <section className={step === 'game' ? 'space-y-5' : 'hidden'} aria-label="Spillet">
          <label className="block text-sm font-medium">Overskrift<input name="title" value={game.title} onChange={event => update('title', event.target.value)} className={input} /></label>
          <label className="block text-sm font-medium">Instruktion til gæsten<input name="instruction" value={game.instruction} onChange={event => update('instruction', event.target.value)} className={input} /></label>
          <label className="block text-sm font-medium">Tekst ved ingen gevinst<input name="revealText" value={game.revealText} onChange={event => update('revealText', event.target.value)} className={input} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Lodder pr. spil<select name="cardsPerPlay" value={game.cardsPerPlay} onChange={event => { setManualTickets(true); update('cardsPerPlay', Number(event.target.value)); }} className={input}>{![3, 6, 9].includes(game.cardsPerPlay) && <option value={game.cardsPerPlay}>{game.cardsPerPlay} felter (gammel opsætning)</option>}<option value={3}>1 lod · 3 felter</option><option value={6}>2 lodder · 6 felter</option><option value={9}>3 lodder · 9 felter</option></select></label>
            <label className="block text-sm font-medium">Maksimalt antal deltagelser<input type="number" min={1} name="totalCardLimit" value={game.totalCardLimit} onChange={event => update('totalCardLimit', Number(event.target.value))} className={input} /></label>
          </div>
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">Hvert lod har 3 felter. Tre ens symboler på ét lod giver én præmie. Vi foreslår {recommendedFields(game.prizes.length) / 3} {recommendedFields(game.prizes.length) === 3 ? 'lod' : 'lodder'} til {game.prizes.length} {game.prizes.length === 1 ? 'præmie' : 'præmier'}. Én deltagelse giver højst én gevinst.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="collectPhone" checked={game.collectPhone} onChange={event => update('collectPhone', event.target.checked)} />Vis valgfrit telefonfelt</label>
          <label className="block text-sm font-medium">Tekst til frivilligt nyhedsbrev<input name="newsletterText" value={game.newsletterText} onChange={event => update('newsletterText', event.target.value)} className={input} /></label>
          <label className="block text-sm font-medium">Emne på gevinstmail<input name="emailSubject" value={game.emailSubject} onChange={event => update('emailSubject', event.target.value)} className={input} /></label>
          <label className="block text-sm font-medium">Personlig tekst i gevinstmail<textarea name="emailMessage" rows={4} value={game.emailMessage} onChange={event => update('emailMessage', event.target.value)} className={input} /><span className="text-xs font-normal text-gray-500">Brandets logo og farver følger med. Præmie og kode indsættes automatisk.</span></label>
        </section>

        <section className={step === 'prizes' ? 'space-y-4' : 'hidden'} aria-label="Præmier">
          <p className={`rounded-lg p-3 text-sm ${chance > 100 ? 'bg-red-50 text-red-800' : 'bg-gray-50 text-gray-700'}`}>Samlet vinderchance: <strong>{chance.toFixed(2)} %</strong>. {chance > 100 ? 'Sænk chancerne til højst 100 % før du gemmer.' : 'Præmielofter kan sænke den faktiske chance.'}</p>
          {game.prizes.map((item, index) => <fieldset key={index} className="grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2"><legend className="px-1 font-semibold">Præmie {index + 1}: {item.name}</legend>
            <label className="text-sm font-medium sm:col-span-2">Navn<input value={item.name} onChange={event => changePrize(index, { name: event.target.value })} className={input} /></label>
            <label className="text-sm font-medium sm:col-span-2">Billede (valgfrit)<input value={item.imageUrl} onChange={event => changePrize(index, { imageUrl: event.target.value })} placeholder="HTTPS URL" className={input} />{upload('prize', index)}</label>
            <label className="text-sm font-medium">Type<select value={item.type} onChange={event => changePrize(index, { type: event.target.value as Prize['type'], value: event.target.value === 'item' ? 0 : 10,codeMode:event.target.value==='item'&&item.codeMode==='shared'?'generated':item.codeMode })} className={input}><option value="item">Gratis produkt</option><option value="percent">Procent</option><option value="amount">Beløb i kr.</option></select></label>
            {item.type !== 'item' && <label className="text-sm font-medium">Værdi<input type="number" min="0.01" step="0.01" value={item.value} onChange={event => changePrize(index, { value: Number(event.target.value) })} className={input} /></label>}
            <label className="text-sm font-medium">Vinderchance %<input type="number" min={0} max={100} step="0.01" value={item.probabilityPercent} onChange={event => changePrize(index, { probabilityPercent: Number(event.target.value) })} className={input} /></label>
            <label className="text-sm font-medium">Maks. vindere<input type="number" min={1} value={item.maxWinners} onChange={event => changePrize(index, { maxWinners: Number(event.target.value) })} className={input} /></label>
            <label className="text-sm font-medium">Rabatkode<select value={item.codeMode} onChange={event => changePrize(index, { codeMode: event.target.value as Prize['codeMode'],redemptionChannels:event.target.value==='shared'?[...new Set<NonNullable<Prize['redemptionChannels']>[number]>([...prizeChannels(item),'orderfly'])]:item.redemptionChannels })} className={input}><option value="generated">Unik kode i Promotions</option>{item.type !== 'item' && <option value="shared">Fælles kode i Promotions</option>}<option value="uploaded">Uploadede eksterne koder</option></select></label>
            {item.codeMode === 'shared' && <label className="text-sm font-medium">Eksisterende Promotions-kode<input value={item.sharedCode || ''} onChange={event => changePrize(index, { sharedCode:event.target.value.toUpperCase() })} className={input} /></label>}
            <div className="text-sm font-medium sm:col-span-2"><p>Hvor kan præmien indløses?</p><div className="mt-2 flex flex-wrap gap-4">{([['restaurant','Restaurant'],['orderfly','Orderfly hjemmeside'],['external','Ekstern hjemmeside']] as const).map(([channel,label])=><label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={prizeChannels(item).includes(channel)} onChange={event=>changePrize(index,{redemptionChannels:event.target.checked?[...prizeChannels(item),channel]:prizeChannels(item).filter(value=>value!==channel)})}/>{label}</label>)}</div><p className="mt-2 text-xs font-normal text-gray-600">Uploadede koder kan bruges i restauranten eller på en ekstern hjemmeside. Orderfly kræver en Promotions-kode. Ved gratis produkter på Orderfly skal produktet vælges nedenfor.</p></div>
            {item.type==='item'&&prizeChannels(item).includes('orderfly')&&<label className="text-sm font-medium sm:col-span-2">Gratis produkt i Orderfly<select value={item.productId||''} onChange={event=>changePrize(index,{productId:event.target.value||undefined})} className={input}><option value="">Vælg produkt</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
            {game.prizes.length > 1 && <button type="button" className="justify-self-start text-sm font-medium text-red-700 underline sm:col-span-2" onClick={() => removePrize(index)}>Fjern præmie</button>}
          </fieldset>)}
          <input type="hidden" name="prizes" value={JSON.stringify(game.prizes)} />
          <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium" onClick={addPrize}>+ Tilføj præmie</button>
        </section>

        <section className={step === 'design' ? 'space-y-5' : 'hidden'} aria-label="Udseende">
          <p className="text-sm text-gray-600">Upload billeder, eller indsæt en HTTPS-adresse. Se ændringerne direkte i forhåndsvisningen.</p>
          <label className="block text-sm font-medium">Logo<input name="logoUrl" value={game.logoUrl} onChange={event => update('logoUrl', event.target.value)} placeholder="HTTPS URL" className={input} />{upload('logo')}</label>
          <label className="block text-sm font-medium">Baggrundsbillede<input name="backgroundUrl" value={game.backgroundUrl} onChange={event => update('backgroundUrl', event.target.value)} placeholder="HTTPS URL" className={input} />{upload('background')}</label>
          <label className="block text-sm font-medium">Skrifttype (WOFF2)<input name="fontUrl" value={game.fontUrl} onChange={event => update('fontUrl', event.target.value)} placeholder="HTTPS URL" className={input} />{upload('font')}</label>
          <div className="grid grid-cols-2 gap-4"><label className="text-sm font-medium">Accentfarve<input type="color" name="primaryColor" value={game.primaryColor} onChange={event => update('primaryColor', event.target.value)} className={input} /></label><label className="text-sm font-medium">Baggrundsfarve<input type="color" name="surfaceColor" value={game.surfaceColor} onChange={event => update('surfaceColor', event.target.value)} className={input} /></label></div>
        </section>

        <section className={step === 'publish' ? 'space-y-5' : 'hidden'} aria-label="Test og udgiv">
          <label className="block text-sm font-medium">Hvor skal spillet vises?<select name="placement" value={game.placement} onChange={event => update('placement', event.target.value as ScratchCardDraft['placement'])} className={input}><option value="selected">Kun på valgte sider</option><option value="all">Hele brandsitet</option></select></label>
          {game.placement === 'selected' && <label className="block text-sm font-medium">Sidestier, én pr. linje<textarea name="paths" rows={3} value={game.paths.join('\n')} onChange={event => update('paths', event.target.value.split(/\r?\n/))} className={input} /><span className="mt-1 block text-xs font-normal text-gray-500">Eksempel: / eller /menu</span></label>}
          {game.placement === 'all' && <input type="hidden" name="paths" value={game.paths.join('\n')} />}
          <label className="block text-sm font-medium">Skjul spillet i denne browser efter deltagelse (dage)<input name="displayCooldownDays" type="number" min={0} max={365} value={game.displayCooldownDays} onChange={event => update('displayCooldownDays', Number(event.target.value))} className={input} /></label>
          <label className="block text-sm font-medium">Tilladte eksterne HTTPS-domæner, ét pr. linje<textarea name="allowedOrigins" rows={3} value={game.allowedOrigins.join('\n')} onChange={event => update('allowedOrigins', event.target.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))} placeholder="https://www.esmeraldapizza.dk" className={input} /></label>
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Gem ændringerne, før du tester. Live kræver en godkendt gevinstskabelon i den centrale notifikationsplatform.</p>
        </section>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <span className="text-xs text-gray-500">Ændringer i forhåndsvisningen gemmes først, når du trykker her.</span>
          <button disabled={pending} className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Gemmer…' : 'Gem opsætning'}</button>
        </div>
      </form>

      {step === 'publish' && <div className="space-y-6 rounded-xl border bg-white p-4 sm:p-6">
        <section className="space-y-3"><h3 className="font-semibold">Test og aktivering</h3><p className="text-sm text-gray-600">Test kræver en gemt opsætning. Uden mailkonfiguration sendes ingen testmail.</p><div className="flex flex-wrap gap-2">{(['draft', 'test', 'live'] as const).map(next => <button type="button" key={next} disabled={pending || status === next} className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${next === 'live' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`} onClick={() => startTransition(async () => { const result = await setScratchCardStatus(brandId, next); setMessage(result.message); if (result.ok) router.refresh(); })}>{next === 'draft' ? 'Deaktivér' : next === 'test' ? 'Sæt i test' : 'Aktivér live'}</button>)}</div></section>
        <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">Test gevinstmail</h3><p className="text-sm text-gray-600">Gem tekst og design først. Testkoden kan ikke indløses.</p><input aria-label="Testmail til" type="email" placeholder="test@eksempel.dk" value={testEmail} onChange={event=>setTestEmail(event.target.value)} className={input}/><button type="button" disabled={pending||!testEmail} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={()=>startTransition(async()=>setMessage((await sendGameTestEmail(brandId,testEmail)).message))}>Send testmail</button></section>
        {brand?.slug&&<section className="space-y-3 border-t pt-5"><h3 className="font-semibold">Indsæt på ekstern hjemmeside</h3><p className="text-sm text-gray-600">Tilføj først hjemmesidens HTTPS-domæne ovenfor og gem. Indsæt derefter denne kode på siden. Spillet følger sidens placering og visningsregler.</p><button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={()=>setEmbedSnippet(`<script async src="${window.location.origin}/api/public/games/embed.js?brand=${encodeURIComponent(brand.slug)}"></script>`)}>Vis indlejringskode</button>{embedSnippet&&<textarea readOnly aria-label="Indlejringskode" rows={2} value={embedSnippet} className={input}/>}</section>}
        <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">Upload præmiekoder</h3><label className="block text-sm">Vælg præmie<select value={codePrize} onChange={event => setCodePrize(Number(event.target.value))} className={input}>{game.prizes.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label><label className="block text-sm">Koder, én pr. linje<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async event => { const file = event.target.files?.[0]; if (file && file.size < 100000) setCodes(await file.text()); }} className="mt-2 block w-full text-xs" /><textarea value={codes} onChange={event => setCodes(event.target.value)} rows={3} className={input} /></label><button type="button" disabled={pending || !codes.trim()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50" onClick={() => startTransition(async () => setMessage((await importGameCodes(brandId, codePrize, codes)).message))}>Importér koder</button></section>
      </div>}
      <p role="status" aria-live="polite" className="text-sm font-medium text-gray-800">{message}</p>
    </div>

    <aside className="min-w-0 self-start xl:sticky xl:top-6"><div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Forhåndsvisning</h2><p className="text-xs text-gray-600">Sådan ser gæsten spillet</p></div><button type="button" onClick={() => setMobile(current => !current)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{mobile ? 'Vis desktop' : 'Vis mobil'}</button></div>
      <div className={`mx-auto ${mobile ? 'max-w-[390px]' : 'max-w-xl'}`}><ScratchGame game={{ ...game, logoUrl: game.logoUrl || brand?.logoUrl || '' }} brandName={brand?.name || brandId} test pathname="/" /></div>
      <p className="mt-3 text-xs text-gray-600">Testspil gemmes særskilt. Brug en ny e-mail for hver test; testkoder kan ikke indløses.</p>
    </aside>
  </div>;
}
