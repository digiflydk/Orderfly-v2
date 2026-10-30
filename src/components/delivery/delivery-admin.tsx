'use client';

import { useEffect, useRef, useState } from 'react';
import { DeliveryOrders } from './delivery-orders';
import { PricingEditor } from './pricing-editor';
import { Button } from '@/components/ui/button';
import { deliverySettingsSchema, deliverySettingsResponseSchema, type DeliverySettings, type DeliverySettingsResponse, type DeliveryOverrides } from '@/lib/delivery/settings/schema';

type Catalog = { brands: Array<{id:string;name:string}>; locations: Array<{id:string;name:string;brandId:string}> };
const inputClass = 'min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
const weekdays = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
const sections = ['Oversigt','Indstillinger','Åbningstider','Områder og priser','Kampagner','Leverandører','Leveringer','Log'] as const;
type Section = typeof sections[number];
const errorText = (status:number) => status === 409 ? 'Indstillingerne er ændret af en anden. Genindlæs før du gemmer igen.' : status === 401 ? 'Din session er udløbet. Log ind igen.' : status === 403 ? 'Du har ikke adgang til disse indstillinger.' : status === 400 ? 'Kontrollér værdierne. Indstillingerne kunne ikke gemmes.' : 'Indstillingerne kunne ikke indlæses eller gemmes. Prøv igen.';
const time = (minute:number) => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const minutes = (value:string) => { const [h,m] = value.split(':').map(Number); return h*60+m; };

export function DeliveryAdmin({brands,locations,fixedScope,readOnly=false}:Catalog & {fixedScope?:{brandId:string;locationId:string};readOnly?:boolean}) {
  const [brandId,setBrandId] = useState(fixedScope?.brandId||'');
  const [locationId,setLocationId] = useState(fixedScope?.locationId||'');
  const [section,setSection] = useState<Section>(fixedScope?'Indstillinger':'Oversigt');
  const [data,setData] = useState<DeliverySettingsResponse|null>(null);
  const [draft,setDraft] = useState<DeliverySettings|null>(null);
  const [overrides,setOverrides] = useState<DeliveryOverrides>({});
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [exceptionDate,setExceptionDate] = useState('');
  const [reload,setReload] = useState(0), [conflict,setConflict] = useState(false);
  const generation = useRef(0), saving = useRef(false);
  const errorSummary=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(error)errorSummary.current?.focus();},[error]);
  useEffect(() => {
    const current = ++generation.current, controller = new AbortController();
    setData(null); setDraft(null); setDirty(false); setError(''); setNotice(''); setConflict(false);
    if (!brandId) { setBusy(false); return () => controller.abort(); }
    setBusy(true);
    const params = new URLSearchParams({brandId}); if(locationId) params.set('locationId',locationId);
    fetch(`/api/delivery/settings?${params}`,{signal:controller.signal,cache:'no-store'}).then(async response => {
      if(!response.ok) throw new Error(errorText(response.status));
      const parsed=deliverySettingsResponseSchema.safeParse(await response.json());
      if(!parsed.success)throw new Error('Serverens svar kunne ikke bekræftes. Genindlæs indstillingerne.');
      const value=parsed.data;
      if(value.brandId!==brandId || value.locationId!==(locationId||null) || !deliverySettingsSchema.safeParse(value.settings).success) throw new Error('Serveren returnerede ugyldige indstillinger. Prøv igen.');
      if(current===generation.current) {setData(value);setDraft(value.settings);setOverrides(value.overrides);}
    }).catch(e=>{if(current===generation.current&&!controller.signal.aborted)setError(e.message);}).finally(()=>{if(current===generation.current)setBusy(false);});
    return ()=>controller.abort();
  },[brandId,locationId,reload]);
  const discard = () => !dirty || window.confirm('Du har ugemte ændringer. Vil du kassere dem?');
  const change = <K extends keyof DeliverySettings>(key:K,value:DeliverySettings[K]) => {
    if(!draft || !data?.editable || busy||readOnly)return;
    setDraft({...draft,[key]:value}); if(locationId)setOverrides({...overrides,[key]:value}); setDirty(true);setNotice('');
  };
  const inherited = (key:keyof DeliverySettings) => locationId && !Object.prototype.hasOwnProperty.call(overrides,key);
  const origin = (key:keyof DeliverySettings) => locationId ? <small className="block text-muted-foreground">{inherited(key)?'Arvet fra brand':'Tilpasset denne restaurant'}</small> : null;
  const save = async () => {
    if(!data||!draft||!dirty||!data.editable||saving.current||conflict||readOnly)return;
    const checked=deliverySettingsSchema.safeParse(draft);
    if(!checked.success){setError('Kontrollér indstillingerne. Tider skal være sorteret uden overlap, og tal skal være inden for de viste grænser.');return;}
    saving.current=true;setBusy(true);setError('');setNotice('');const current=generation.current;
    try {
      const command=locationId?{scope:'location',brandId,locationId,expectedRevision:data.revision,expectedBrandRevision:data.brandRevision,overrides}:{scope:'brand',brandId,locationId:null,expectedRevision:data.revision,settings:checked.data};
      const response=await fetch('/api/delivery/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
      if(!response.ok){if(response.status===409)setConflict(true);throw new Error(errorText(response.status));}
      const parsed=deliverySettingsResponseSchema.safeParse(await response.json());
      if(!parsed.success)throw new Error('Serverens svar kunne ikke bekræftes. Genindlæs indstillingerne.');
      const value=parsed.data;
      if(value.brandId!==brandId||value.locationId!==(locationId||null)||value.revision!==data.revision+1||value.brandRevision!==(locationId?data.brandRevision:data.brandRevision+1))throw new Error('Svaret kunne ikke bekræftes. Genindlæs for at kontrollere, om ændringen blev gemt.');
      if(current===generation.current){setData(value);setDraft(value.settings);setOverrides(value.overrides);setDirty(false);setNotice(fixedScope?'Indstillingerne er gemt. En aktiv merchant bruger disse indstillinger i checkout.':'Indstillingerne er gemt. Kundevendt levering er endnu ikke aktiveret.');}
    } catch(e){if(current===generation.current){setConflict(true);setError(e instanceof Error?e.message:'Svaret kunne ikke bekræftes. Genindlæs indstillingerne.');}}
    finally{saving.current=false;if(current===generation.current)setBusy(false);}
  };
  const reset = () => {if(!data||!locationId||!window.confirm('Nulstil alle lokale tilpasninger til brandets indstillinger? Ændringen træder først i kraft, når du gemmer.'))return;setOverrides({});setDraft(data.brandSettings);setDirty(true);setNotice('Brandets indstillinger vises nu. Gem for at fjerne alle lokale tilpasninger.');};
  return <div className="space-y-6" aria-busy={busy}>
    {!fixedScope&&<><header><h1 className="text-2xl font-bold">Levering</h1><p className="mt-2 text-muted-foreground">Administrer levering for dit brand og dine restauranter.</p></header>
    <div className="rounded-lg border p-4"><h2 className="font-semibold">Klargøring af levering</h2><p>Indstillinger kan forberedes her. Levering til kunder åbnes først, når leverandør, priser og den samlede test er godkendt.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Brand<select className={inputClass} value={brandId} disabled={busy} onChange={e=>{if(discard()){setBrandId(e.target.value);setLocationId('');}}}><option value="">Vælg brand</option>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Restaurant<select className={inputClass} value={locationId} disabled={!brandId||busy} onChange={e=>{if(discard())setLocationId(e.target.value);}}><option value="">Brandets standardindstillinger</option>{locations.filter(l=>l.brandId===brandId).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    </div>
    </>}<nav aria-label="Levering"><div className="flex flex-wrap gap-2">{sections.filter(s=>!fixedScope||!['Oversigt','Leverandører'].includes(s)).map(s=><Button key={s} className="min-h-11" variant={section===s?'default':'outline'} aria-current={section===s?'page':undefined} onClick={()=>setSection(s)}>{s}</Button>)}</div></nav>
    {error&&<div ref={errorSummary} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-4"><p>{error}</p><Button className="mt-2 min-h-11" variant="outline" disabled={busy} onClick={()=>{if(discard())setReload(r=>r+1);}}>Genindlæs</Button></div>}
    <p role="status" className="text-sm">{busy?'Indlæser eller gemmer indstillinger…':notice||(dirty?'Ugemte ændringer':'')}</p>
    {!brandId&&<p>Vælg et brand for at se leveringsindstillinger.</p>}
    {draft&&data&&<>
      {!data.editable&&<p>Du kan se indstillingerne, men har ikke adgang til at ændre dem.</p>}
      {section==='Leveringer'||section==='Log'?(locationId?<DeliveryOrders key={`${brandId}:${locationId}`} brandId={brandId} locationId={locationId} showLog={section==='Log'}/>:<p>Vælg en restaurant for at se leveringer og log.</p>):section==='Leverandører'?<section className="rounded-lg border p-4 space-y-3"><h2 className="text-xl font-semibold">Leverandører</h2><dl className="space-y-2"><div><dt className="font-medium">Valgt i indstillinger</dt><dd>{draft.providerId==='wolt'?'Wolt Drive':draft.providerId||'Ingen leverandør valgt'}</dd></div><div><dt className="font-medium">Forbindelse</dt><dd>Forbindelsesstatus kan endnu ikke kontrolleres her.</dd></div><div><dt className="font-medium">Levering til kunder</dt><dd>Ikke aktiveret</dd></div></dl><p>Valg af leverandør gemmer kun konfigurationen. Det bekræfter ikke en forbindelse eller et leveringsområde.</p><p>Før åbning skal restaurantens tilknytning, ruteafstande, priser, betaling og leveringstest være verificeret.</p><Button className="min-h-11" variant="outline" onClick={()=>setSection('Indstillinger')}>Vælg leverandør i indstillinger</Button></section>:section==='Oversigt'?<section className="rounded-lg border p-4 space-y-3"><h2 className="text-xl font-semibold">Leveringsstatus</h2><p>Kundevendt levering: Ikke aktiveret</p><p>Valgt leverandør: {draft.providerId==='wolt'?'Wolt Drive':draft.providerId||'Ingen'}</p><p>Pause i konfiguration: {draft.paused?'Ja':'Nej'}</p><p>Priser og leveringsområder kan forberedes under Områder og priser. Leverandøropsætning og leveringslog tilføjes, når integrationen er klar. Der vises ingen simulerede leveringer.</p></section>:<fieldset disabled={!data.editable||busy||conflict||readOnly} className="space-y-5 rounded-lg border p-4"><legend className="px-2 text-xl font-semibold">{section}</legend>
        {section==='Områder og priser'||section==='Kampagner'?<><p>{section==='Kampagner'?'Gratis levering og tilskud konfigureres sammen med prisreglerne, så reglerne kan kontrolleres samlet.':'Leveringsområdet afgrænses med maksimal ruteafstand. Både denne grænse og grænsen under Indstillinger skal være opfyldt.'}</p>{origin('pricingRules')}<PricingEditor value={draft.pricingRules} onChange={v=>change('pricingRules',v)}/></>:section==='Indstillinger'?<>
          {fixedScope&&<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.enabled} onChange={e=>change('enabled',e.target.checked)}/>Tillad levering for denne restaurant{origin('enabled')}</label>}
          <label className="block">Leverandør<select className={inputClass} value={draft.providerId||''} onChange={e=>change('providerId',e.target.value||null)}><option value="">Ingen leverandør</option><option value="wolt">Wolt Drive</option>{draft.providerId&&draft.providerId!=='wolt'&&<option value={draft.providerId}>{draft.providerId} (allerede konfigureret)</option>}</select>{origin('providerId')}</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.paused} onChange={e=>change('paused',e.target.checked)}/>Pause levering{origin('paused')}</label>
          {(['preparationMinutes','maxTransportMinutes','maxDistanceMeters'] as const).map((key,i)=><label key={key} className="block">{['Klargøringstid (minutter, 0–240)','Maksimal transporttid (minutter, 1–240)','Maksimal ruteafstand (meter, 1–100.000)'][i]}<input className={inputClass} type="number" min={i===0?0:1} max={i===2?100000:240} step="1" value={Number.isFinite(draft[key])?draft[key]:''} onChange={e=>change(key,e.target.value===''?NaN:Number(e.target.value))}/>{origin(key)}</label>)}
        </>:<><label className="block">Leveringstider<select className={inputClass} value={draft.scheduleMode} onChange={e=>change('scheduleMode',e.target.value as DeliverySettings['scheduleMode'])}><option value="restaurant">Følg restaurantens åbningstider</option><option value="manual">Angiv leveringstider manuelt</option></select>{origin('scheduleMode')}</label>
          {draft.scheduleMode==='restaurant'?<><p>Buddet kan hente fra {draft.pickupOpeningOffsetMinutes} minutter efter åbning til {draft.pickupClosingOffsetMinutes} minutter før lukning. Kunden ser forventet levering 30 minutter efter afhentning. Ved åbent 11–22 og standardindstillinger er afhentning 11.20–21.40 og forventet levering 11.50–22.10.</p>{(['pickupOpeningOffsetMinutes','pickupClosingOffsetMinutes'] as const).map((key,i)=><label key={key} className="block">{i===0?'Minutter efter åbning (0–240)':'Minutter før lukning (0–240)'}<input className={inputClass} type="number" min={0} max={240} step="1" value={Number.isFinite(draft[key])?draft[key]:''} onChange={e=>change(key,e.target.value===''?NaN:Number(e.target.value))}/>{origin(key)}</label>)}</>:<><p>Tiderne angiver, hvornår buddet kan hente ordren. Kunden ser forventet levering 30 minutter senere.</p><p>Tidszone: Europe/Copenhagen. Sluttid 00:00 betyder midnat ved dagens afslutning. Tidsrum skal stå i rækkefølge og må ikke overlappe.</p>{origin('weeklyHours')}
          {[1,2,3,4,5,6,0].map(day=>{const row=draft.weeklyHours.find(d=>d.day===day)!;return <fieldset key={day} className="rounded border p-3 space-y-3"><legend>{weekdays[day]}</legend>{!row.intervals.length&&<p>Lukket</p>}{row.intervals.map((interval,index)=><div key={index} className="flex flex-wrap items-end gap-3"><label>Fra<input className={inputClass} aria-label={`${weekdays[day]} fra ${index+1}`} type="time" value={time(interval.startMinute)} onChange={e=>change('weeklyHours',draft.weeklyHours.map(d=>d.day!==day?d:{...d,intervals:d.intervals.map((v,j)=>j===index?{...v,startMinute:minutes(e.target.value)}:v)}))}/></label><label>Til<input className={inputClass} aria-label={`${weekdays[day]} til ${index+1}`} type="time" value={time(interval.endMinute===1440?0:interval.endMinute)} onChange={e=>change('weeklyHours',draft.weeklyHours.map(d=>d.day!==day?d:{...d,intervals:d.intervals.map((v,j)=>j===index?{...v,endMinute:minutes(e.target.value)===0?1440:minutes(e.target.value)}:v)}))}/></label><Button variant="outline" className="min-h-11" onClick={()=>change('weeklyHours',draft.weeklyHours.map(d=>d.day!==day?d:{...d,intervals:d.intervals.filter((_,j)=>j!==index)}))}>Fjern tidsrum</Button></div>)}<Button variant="outline" className="min-h-11" disabled={row.intervals.length>=12} onClick={()=>change('weeklyHours',draft.weeklyHours.map(d=>d.day!==day?d:{...d,intervals:[...d.intervals,{startMinute:660,endMinute:1260}]}))}>Tilføj tidsrum {weekdays[day].toLowerCase()}</Button></fieldset>;})}
          </>}<section className="space-y-3"><h3 className="font-semibold">Særåbningstider og helligdage</h3><p>En dato erstatter hele dagens plan for buddets afhentning. Uden tidsrum er der lukket. Særåbningstider gælder også, når levering følger restaurantens åbningstider.</p>{origin('exceptions')}
            <label className="block">Dato<input className={inputClass} type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/></label>
            <Button variant="outline" className="min-h-11" disabled={!exceptionDate||draft.exceptions.some(d=>d.date===exceptionDate)||draft.exceptions.length>=366} onClick={()=>{change('exceptions',[...draft.exceptions,{date:exceptionDate,intervals:[]}].sort((a,b)=>a.date.localeCompare(b.date)));setExceptionDate('');}}>Tilføj særåbningstid</Button>
            {draft.exceptions.map((day,di)=><fieldset className="rounded border p-3 space-y-3" key={day.date}><legend>{day.date}</legend>{day.intervals.length===0&&<p>Lukket</p>}{day.intervals.map((interval,i)=><div key={i} className="flex flex-wrap gap-3"><label>Fra<input className={inputClass} aria-label={`${day.date} fra ${i+1}`} type="time" value={time(interval.startMinute)} onChange={e=>change('exceptions',draft.exceptions.map((d,j)=>j!==di?d:{...d,intervals:d.intervals.map((v,k)=>k!==i?v:{...v,startMinute:minutes(e.target.value)})}))}/></label><label>Til<input className={inputClass} aria-label={`${day.date} til ${i+1}`} type="time" value={time(interval.endMinute===1440?0:interval.endMinute)} onChange={e=>change('exceptions',draft.exceptions.map((d,j)=>j!==di?d:{...d,intervals:d.intervals.map((v,k)=>k!==i?v:{...v,endMinute:minutes(e.target.value)===0?1440:minutes(e.target.value)})}))}/></label><Button variant="outline" className="min-h-11" onClick={()=>change('exceptions',draft.exceptions.map((d,j)=>j!==di?d:{...d,intervals:d.intervals.filter((_,k)=>k!==i)}))}>Fjern tidsrum</Button></div>)}<div className="flex flex-wrap gap-3"><Button variant="outline" className="min-h-11" disabled={day.intervals.length>=12} onClick={()=>change('exceptions',draft.exceptions.map((d,j)=>j!==di?d:{...d,intervals:[...d.intervals,{startMinute:660,endMinute:1260}]}))}>Tilføj tidsrum {day.date}</Button><Button variant="outline" className="min-h-11" onClick={()=>change('exceptions',draft.exceptions.filter((_,j)=>j!==di))}>Fjern dato {day.date}</Button></div></fieldset>)}
          </section>
        </>}
        <div className="flex flex-wrap gap-3"><Button className="min-h-11" disabled={!dirty} onClick={save}>Gem indstillinger</Button>{locationId&&<Button className="min-h-11" variant="outline" onClick={reset}>Nulstil alle lokale tilpasninger</Button>}</div>
      </fieldset>}
    </>}
  </div>;
}
