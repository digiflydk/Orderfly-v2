'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveScratchCardDraft } from '@/app/superadmin/games/actions';
import { esmeraldaScratchTest, type ScratchCardDraft } from '@/lib/games/scratch-card';
import { ScratchCard } from './ScratchCard';

type Prize = ScratchCardDraft['prizes'][number];
const starter:Prize = {name:'Testpræmie',type:'item',value:0,probabilityPercent:10,maxWinners:100};
export function ScratchCardEditor({brands,brandId,draft,preset=false}:{brands:Array<{id:string;name:string;slug:string;logoUrl:string}>;brandId:string;draft:ScratchCardDraft|null;preset?:boolean}) {
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  const [message,setMessage] = useState('');
  const [placement,setPlacement] = useState<'all'|'selected'>(draft?.placement || 'selected');
  const [title,setTitle] = useState(draft?.title || 'Skrab og se, hvad der gemmer sig');
  const [instruction,setInstruction] = useState(draft?.instruction || 'Skrab feltet for at afsløre resultatet.');
  const [revealText,setRevealText] = useState(draft?.revealText || 'Ingen gevinst denne gang');
  const [paths,setPaths] = useState(draft?.paths.join('\n') || '/');
  const [logoUrl,setLogoUrl] = useState(draft?.logoUrl || '');
  const [cardsPerPlay,setCardsPerPlay] = useState(draft?.cardsPerPlay || 1);
  const [totalCardLimit,setTotalCardLimit] = useState(draft?.totalCardLimit || 1000);
  const [prizes,setPrizes] = useState<Prize[]>(draft?.prizes || [starter]);
  const [mobile,setMobile] = useState(true);
  const brand = brands.find(b=>b.id===brandId);
  const chance = prizes.reduce((sum,p)=>sum+(Number(p.probabilityPercent)||0),0);
  function changePrize(index:number, changes:Partial<Prize>) {
    setPrizes(current=>current.map((p,i)=>i===index?{...p,...changes}:p));
  }
  function loadEsmeraldaTest() {
    const sample=esmeraldaScratchTest(brandId);
    setTitle(sample.title);setInstruction(sample.instruction);setRevealText(sample.revealText);
    setLogoUrl(sample.logoUrl);setCardsPerPlay(sample.cardsPerPlay);
    setTotalCardLimit(sample.totalCardLimit);setPrizes(sample.prizes);
    setPlacement(sample.placement);setPaths(sample.paths.join('\n'));
    setMessage('Esmeralda-testspillet er indlæst. Gem udkastet, hvis du vil bevare opsætningen.');
  }
  function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async()=>{
      const result = await saveScratchCardDraft(form);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  const input = 'mt-1 w-full min-w-0 rounded-md border p-2';
  return <div className="grid min-w-0 gap-8 xl:grid-cols-2">
    <form onSubmit={submit} className="min-w-0 space-y-5 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{preset?'Esmeraldas testspil er indlæst. Tryk Gem udkast for at bevare opsætningen. ':'Status: Kun udkast. '}Sandsynligheder og præmielofter er til opsætning og preview. Ingen kunder kan spille eller vinde endnu.</div>
      <label className="block text-sm font-medium">Brand
        <select className={input} value={brandId} onChange={e=>router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(e.target.value)}`)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </label>
      <input type="hidden" name="brandId" value={brandId}/>
      {brand?.slug==='esmeralda'&&<button type="button" onClick={loadEsmeraldaTest} className="rounded-md border border-yellow-500 bg-yellow-50 px-4 py-2 text-sm font-medium">Indlæs Esmeralda-testspil: Pizza 10 %, Tiramisu 25 %, Pommes frites 65 %</button>}
      <label className="block text-sm font-medium">Brandlogo<input name="logoUrl" value={logoUrl} onChange={e=>setLogoUrl(e.target.value)} placeholder={brand?.logoUrl || 'https://…'} className={input}/><span className="mt-1 block text-xs text-muted-foreground">Tomt felt bruger brandets eksisterende logo. Alternativt en HTTPS billedadresse.</span></label>
      <label className="block text-sm font-medium">Overskrift<input name="title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={100} className={input}/></label>
      <label className="block text-sm font-medium">Instruktion<input name="instruction" value={instruction} onChange={e=>setInstruction(e.target.value)} required maxLength={240} className={input}/></label>
      <label className="block text-sm font-medium">Tekst hvis kortet ikke vinder<input name="revealText" value={revealText} onChange={e=>setRevealText(e.target.value)} required maxLength={160} className={input}/></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Kort pr. spil<input type="number" name="cardsPerPlay" min={1} max={6} step={1} value={cardsPerPlay} onChange={e=>setCardsPerPlay(Number(e.target.value))} className={input}/></label>
        <label className="block text-sm font-medium">Samlet antal kort i kampagnen<input type="number" name="totalCardLimit" min={1} max={1000000} step={1} value={totalCardLimit} onChange={e=>setTotalCardLimit(Number(e.target.value))} className={input}/></label>
      </div>
      <fieldset className="space-y-4 rounded-lg border p-3 sm:p-4"><legend className="px-1 font-semibold">Præmier og vinderchancer</legend>
        {prizes.map((prize,index)=><div key={index} className="grid gap-3 rounded-md bg-gray-50 p-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Præmie {index+1}<input value={prize.name} onChange={e=>changePrize(index,{name:e.target.value})} maxLength={100} className={input}/></label>
          <label className="text-sm font-medium">Type<select value={prize.type} onChange={e=>changePrize(index,{type:e.target.value as Prize['type'],value:e.target.value==='item'?0:10})} className={input}><option value="item">Gratis produkt</option><option value="percent">Rabat i %</option><option value="amount">Rabat i kr.</option></select></label>
          {prize.type!=='item' && <label className="text-sm font-medium">Værdi<input type="number" min={prize.type==='percent'?1:.01} max={prize.type==='percent'?100:10000} step={prize.type==='percent'?1:.01} value={prize.value} onChange={e=>changePrize(index,{value:Number(e.target.value)})} className={input}/></label>}
          <label className="text-sm font-medium">Chance pr. spil (%)<input type="number" min={0} max={100} step={.01} value={prize.probabilityPercent} onChange={e=>changePrize(index,{probabilityPercent:Number(e.target.value)})} className={input}/></label>
          <label className="text-sm font-medium">Maks. vindere<input type="number" min={1} max={totalCardLimit} step={1} value={prize.maxWinners} onChange={e=>changePrize(index,{maxWinners:Number(e.target.value)})} className={input}/></label>
          {prizes.length>1 && <button type="button" onClick={()=>setPrizes(current=>current.filter((_,i)=>i!==index))} className="text-left text-sm text-red-700">Fjern præmie</button>}
        </div>)}
        <input type="hidden" name="prizes" value={JSON.stringify(prizes)}/>
        {prizes.length<12 && <button type="button" onClick={()=>setPrizes(current=>[...current,{...starter,name:`Præmie ${current.length+1}`}])} className="rounded-md border px-3 py-2 text-sm">Tilføj præmie</button>}
        <p className="text-sm">Samlet vinderchance: <strong className={chance>100?'text-red-700':''}>{chance.toFixed(2)} %</strong> pr. spil. Resten ({Math.max(0,100-chance).toFixed(2)} %) giver ingen gevinst.</p>
      </fieldset>
      <label className="block text-sm font-medium">Fremtidig placering<select name="placement" value={placement} onChange={e=>setPlacement(e.target.value as 'all'|'selected')} className={input}><option value="selected">Kun valgte sider</option><option value="all">Hele brandsitet</option></select></label>
      {placement==='selected' && <label className="block text-sm font-medium">Sideadresser, én sti pr. linje<textarea name="paths" value={paths} onChange={e=>setPaths(e.target.value)} rows={4} placeholder={'/\n/menu'} className={input}/><span className="mt-1 block text-xs text-muted-foreground">Eksempel: / eller /menu. Brug stier uden domænenavn.</span></label>}
      {placement==='all' && <input type="hidden" name="paths" value=""/>}
      <button disabled={pending} className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-50">{pending?'Gemmer…':'Gem udkast'}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
    <div className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Administrator-preview</h2><div className="flex gap-2"><button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)} className="rounded border px-3 py-1 text-sm">Mobil 390 px</button><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)} className="rounded border px-3 py-1 text-sm">Desktop</button></div></div>
      <div className={`mx-auto w-full ${mobile?'max-w-[390px]':'max-w-xl'}`}><ScratchCard brandName={brand?.name||brandId} logoUrl={logoUrl||brand?.logoUrl||''} title={title} instruction={instruction} noWinText={revealText} cardsPerPlay={Math.max(1,Math.min(6,cardsPerPlay||1))} prizes={prizes}/></div>
      <p className="mt-3 text-xs text-muted-foreground">Preview udtrækker kun illustrative resultater i din browser. Den bruger ikke præmieloftet og registrerer ingen gevinster.</p>
    </div>
  </div>;
}
