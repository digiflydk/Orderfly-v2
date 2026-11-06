'use client';
import {useState,useTransition} from 'react';
import {runManualImport} from './actions';
export function ManualImport({brandId,locationId}:{brandId:string;locationId:string}){
 const [raw,setRaw]=useState(''),[publish,setPublish]=useState(false),[message,setMessage]=useState(''),[pending,start]=useTransition();
 return <details className="space-y-3 rounded border p-3"><summary>Manuel Google-import</summary><p>Indsæt op til 100 femstjernede anmeldelser som JSON. Importen erstatter den tidligere Google-import for denne lokation. Data udløber efter 29 dage.</p><label className="block">Anmeldelser (JSON)<textarea className="block min-h-40 w-full rounded border p-2" value={raw} onChange={e=>setRaw(e.target.value)} maxLength={800000}/></label><label className="flex gap-2"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/>Vis de importerede anmeldelser på hjemmesiden</label><button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={pending||!raw} onClick={()=>start(async()=>{const result=await runManualImport(brandId,locationId,raw,publish);setMessage(result.message);if(result.ok)setRaw('');})}>{pending?'Importerer…':'Importer anmeldelser'}</button><p role="status">{message}</p></details>;
}
