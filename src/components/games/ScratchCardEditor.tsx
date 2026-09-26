'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { importGameCodes, redeemGameVoucher, saveScratchCardDraft, setScratchCardStatus, uploadGameAsset } from '@/app/superadmin/games/actions';
import { esmeraldaScratchTest, scratchCardDraftSchema, type ScratchCardDraft } from '@/lib/games/scratch-card';
import { ScratchGame } from './ScratchGame';

type Prize=ScratchCardDraft['prizes'][number];
const starter:Prize={name:'Testpræmie',imageUrl:'',type:'item',value:0,probabilityPercent:10,maxWinners:100,codeMode:'generated',redemption:'restaurant'};
const recommendedFields=(prizeCount:number)=>Math.min(3,Math.max(1,Math.ceil(prizeCount/2)))*3;
export function ScratchCardEditor({brands,brandId,draft,status='draft',preset=false}:{brands:Array<{id:string;name:string;slug:string;logoUrl:string}>;brandId:string;draft:ScratchCardDraft|null;status?:string;preset?:boolean}){
  const router=useRouter(),[pending,startTransition]=useTransition(),[message,setMessage]=useState('');
  const [game,setGame]=useState<ScratchCardDraft>(draft||scratchCardDraftSchema.parse({brandId,title:'Skrab og vind',instruction:'Skrab felterne og se din gevinst.',revealText:'Ingen gevinst denne gang',prizes:[starter],placement:'selected',paths:['/']}));
  const [manualTickets,setManualTickets]=useState(false);
  const [codes,setCodes]=useState(''),[codePrize,setCodePrize]=useState(0),[redeem,setRedeem]=useState(''),[mobile,setMobile]=useState(true);
  const brand=brands.find(b=>b.id===brandId);
  const input='mt-1 w-full min-w-0 rounded-md border p-2';
  function update<K extends keyof ScratchCardDraft>(key:K,value:ScratchCardDraft[K]){setGame(current=>({...current,[key]:value}));}
  function prize(index:number,change:Partial<Prize>){update('prizes',game.prizes.map((p,i)=>i===index?{...p,...change}:p));}
  function save(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);startTransition(async()=>{const r=await saveScratchCardDraft(data);setMessage(r.message);if(r.ok)router.refresh();});}
  async function asset(kind:'logo'|'background'|'font'|'prize',file:File,index?:number){const data=new FormData();data.set('brandId',brandId);data.set('kind',kind);data.set('file',file);const result=await uploadGameAsset(data);setMessage(result.message);if(result.ok&&result.url){if(kind==='prize'&&index!==undefined)prize(index,{imageUrl:result.url});else update(kind==='logo'?'logoUrl':kind==='font'?'fontUrl':'backgroundUrl',result.url);}}
  const upload=(kind:'logo'|'background'|'font'|'prize',index?:number)=><input type="file" accept={kind==='font'?'.woff2,font/woff2':'image/jpeg,image/png,image/webp'} className="mt-1 block w-full text-xs" onChange={e=>{const file=e.target.files?.[0];if(file)void asset(kind,file,index);}}/>;
  return <div className="grid min-w-0 gap-8 xl:grid-cols-2">
    <div className="space-y-5"><form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-4 sm:p-6">
      <p className="rounded bg-amber-50 p-3 text-sm">Status: {status}. {preset?'Esmeralda eksemplet er indlæst. Gem det for at prøve kundeforløbet.':'Gem opsætningen og prøv det rigtige kundeforløb nedenfor.'}</p>
      <label className="block text-sm">Brand<select className={input} value={brandId} onChange={e=>router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(e.target.value)}`)}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <input type="hidden" name="brandId" value={brandId}/>
      {brand?.slug==='esmeralda'&&<button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{setGame(esmeraldaScratchTest(brandId));setManualTickets(false);setMessage('Esmeralda testen er indlæst. Gem opsætningen.');}}>Indlæs Esmeralda: Pizza 10 %, Tiramisu 25 %, Pommes frites 65 %</button>}
      <h2 className="text-lg font-semibold">Branding</h2>
      <label className="block text-sm">Logo (HTTPS URL)<input name="logoUrl" value={game.logoUrl} onChange={e=>update('logoUrl',e.target.value)} className={input}/>{upload('logo')}</label>
      <label className="block text-sm">Baggrundsbillede<input name="backgroundUrl" value={game.backgroundUrl} onChange={e=>update('backgroundUrl',e.target.value)} className={input}/>{upload('background')}</label>
      <label className="block text-sm">Skrifttype (WOFF2)<input name="fontUrl" value={game.fontUrl} onChange={e=>update('fontUrl',e.target.value)} className={input}/>{upload('font')}</label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Accentfarve<input type="color" name="primaryColor" value={game.primaryColor} onChange={e=>update('primaryColor',e.target.value)} className={input}/></label><label className="text-sm">Baggrundsfarve<input type="color" name="surfaceColor" value={game.surfaceColor} onChange={e=>update('surfaceColor',e.target.value)} className={input}/></label></div>
      <h2 className="text-lg font-semibold">Spil og formular</h2>
      {(['title','instruction','revealText'] as const).map(key=><label key={key} className="block text-sm">{{title:'Overskrift',instruction:'Instruktion',revealText:'Ingen gevinst'}[key]}<input name={key} value={game[key]} onChange={e=>update(key,e.target.value)} className={input}/></label>)}
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Skrabelodder pr. spil<select name="cardsPerPlay" value={game.cardsPerPlay} onChange={e=>{setManualTickets(true);update('cardsPerPlay',Number(e.target.value));}} className={input}>{![3,6,9].includes(game.cardsPerPlay)&&<option value={game.cardsPerPlay}>{game.cardsPerPlay} felter (tidligere opsætning)</option>}<option value={3}>1 lod (3 felter)</option><option value={6}>2 lodder (6 felter)</option><option value={9}>3 lodder (9 felter)</option></select></label><label className="text-sm">Maks. spil<input type="number" min={1} name="totalCardLimit" value={game.totalCardLimit} onChange={e=>update('totalCardLimit',Number(e.target.value))} className={input}/></label></div>
      <p className="text-xs text-gray-600">Anbefaling ved {game.prizes.length} præmier: {recommendedFields(game.prizes.length)/3} lodder. Når du tilføjer eller fjerner præmier, opdateres antallet automatisk, indtil du selv vælger et antal.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="collectPhone" checked={game.collectPhone} onChange={e=>update('collectPhone',e.target.checked)}/>Vis valgfrit telefonfelt</label>
      <label className="block text-sm">Tekst til frivilligt nyhedsbrev<input name="newsletterText" value={game.newsletterText} onChange={e=>update('newsletterText',e.target.value)} className={input}/></label>
      <fieldset className="space-y-4 rounded border p-3"><legend className="font-semibold">Præmier og chancer</legend>
        {game.prizes.map((p,i)=><div key={i} className="grid gap-3 rounded bg-gray-50 p-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Navn<input value={p.name} onChange={e=>prize(i,{name:e.target.value})} className={input}/></label>
          <label className="text-sm sm:col-span-2">Præmiebillede<input value={p.imageUrl} onChange={e=>prize(i,{imageUrl:e.target.value})} placeholder="HTTPS URL" className={input}/>{upload('prize',i)}</label>
          <label className="text-sm">Type<select value={p.type} onChange={e=>prize(i,{type:e.target.value as Prize['type'],value:e.target.value==='item'?0:10,redemption:e.target.value==='item'?'restaurant':p.redemption})} className={input}><option value="item">Gratis produkt</option><option value="percent">Procent</option><option value="amount">Beløb i kr.</option></select></label>
          {p.type!=='item'&&<label className="text-sm">Værdi<input type="number" min="0.01" step="0.01" value={p.value} onChange={e=>prize(i,{value:Number(e.target.value)})} className={input}/></label>}
          <label className="text-sm">Sandsynlighed %<input type="number" min={0} max={100} step="0.01" value={p.probabilityPercent} onChange={e=>prize(i,{probabilityPercent:Number(e.target.value)})} className={input}/></label>
          <label className="text-sm">Maks. vindere<input type="number" min={1} value={p.maxWinners} onChange={e=>prize(i,{maxWinners:Number(e.target.value)})} className={input}/></label>
          <label className="text-sm">Kode<select value={p.codeMode} onChange={e=>prize(i,{codeMode:e.target.value as Prize['codeMode']})} className={input}><option value="generated">Generér automatisk</option><option value="uploaded">Uploadet kode</option></select></label>
          <label className="text-sm">Indløsning<select value={p.redemption} onChange={e=>prize(i,{redemption:e.target.value as Prize['redemption']})} className={input}><option value="restaurant">Restaurant</option>{p.type!=='item'&&<><option value="website">Hjemmeside</option><option value="both">Begge</option></>}</select></label>
          {game.prizes.length>1&&<button type="button" className="text-left text-sm text-red-700" onClick={()=>setGame(current=>{const prizes=current.prizes.filter((_,j)=>i!==j);return {...current,prizes,cardsPerPlay:manualTickets?current.cardsPerPlay:recommendedFields(prizes.length)};})}>Fjern præmie</button>}
        </div>)}
        <input type="hidden" name="prizes" value={JSON.stringify(game.prizes)}/><button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>setGame(current=>{const prizes=[...current.prizes,{...starter,name:`Præmie ${current.prizes.length+1}`}];return {...current,prizes,cardsPerPlay:manualTickets?current.cardsPerPlay:recommendedFields(prizes.length)};})}>Tilføj præmie</button>
        <p className="text-sm">Samlet chance: {game.prizes.reduce((n,p)=>n+p.probabilityPercent,0).toFixed(2)} %. Præmielofter kan sænke den faktiske chance.</p>
      </fieldset>
      <label className="block text-sm">Placering<select name="placement" value={game.placement} onChange={e=>update('placement',e.target.value as ScratchCardDraft['placement'])} className={input}><option value="selected">Valgte sider</option><option value="all">Hele brandsitet</option></select></label>
      <label className="block text-sm">Sidestier, én pr. linje<textarea name="paths" rows={3} value={game.paths.join('\n')} onChange={e=>update('paths',e.target.value.split(/\r?\n/))} className={input}/></label>
      <button disabled={pending} className="rounded bg-black px-5 py-3 text-white">Gem opsætning</button>
    </form>
    <div className="space-y-4 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">Koder, test og aktivering</h2>
      <label className="block text-sm">Præmie til kodeimport<select value={codePrize} onChange={e=>setCodePrize(Number(e.target.value))} className={input}>{game.prizes.map((p,i)=><option key={i} value={i}>{p.name}</option>)}</select></label>
      <label className="block text-sm">Uploadede koder, én pr. linje<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async e=>{const file=e.target.files?.[0];if(file&&file.size<100000)setCodes(await file.text());}} className="mt-2 block w-full text-xs"/><textarea value={codes} onChange={e=>setCodes(e.target.value)} rows={4} className={input}/></label>
      <button type="button" className="rounded border px-3 py-2" onClick={()=>startTransition(async()=>setMessage((await importGameCodes(brandId,codePrize,codes)).message))}>Importér koder</button>
      <div className="flex flex-wrap gap-2">{(['draft','test','live'] as const).map(s=><button type="button" key={s} className="rounded border px-3 py-2" onClick={()=>startTransition(async()=>{const r=await setScratchCardStatus(brandId,s);setMessage(r.message);if(r.ok)router.refresh();})}>{s==='draft'?'Deaktivér':s==='test'?'Teststatus':'Aktivér live'}</button>)}</div>
      <p className="text-xs">Live kræver særskilt aktiveret Omnisend gevinstmail. Test kræver kun en gemt opsætning; uden mailkonfiguration sendes ingen testmail.</p>
      <label className="block text-sm">Indløs kode i restaurant<input value={redeem} onChange={e=>setRedeem(e.target.value.toUpperCase())} className={input}/></label><button type="button" className="rounded border px-3 py-2" onClick={()=>startTransition(async()=>setMessage((await redeemGameVoucher(brandId,redeem)).message))}>Indløs én gang</button>
      <p role="status" className="text-sm">{message}</p>
    </div></div>
    <div className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Kundeoplevelse</h2><button type="button" onClick={()=>setMobile(n=>!n)} className="rounded border px-3 py-1 text-sm">{mobile?'Vis desktop':'Vis mobil'}</button></div>
      <div className={`mx-auto ${mobile?'max-w-[390px]':'max-w-xl'}`}><ScratchGame game={{...game,logoUrl:game.logoUrl||brand?.logoUrl||''}} brandName={brand?.name||brandId} test pathname="/"/></div>
      <p className="mt-3 text-xs">Gem ændringer før testen. Én test pr. e-mail; testkoder kan ikke indløses.</p>
    </div>
  </div>;
}
