'use client';
import {useState,useTransition} from 'react';
import {runGoogleImport} from './actions';
export function ImportButton({brandId,locationId,configured,canEdit}:{brandId:string;locationId:string;configured:boolean;canEdit:boolean}) {
  const [pending,start]=useTransition(),[message,setMessage]=useState('');
  return <div><button className="rounded border px-4 py-2 disabled:opacity-50" disabled={!configured||!canEdit||pending} onClick={()=>start(async()=>{try{const result=await runGoogleImport(brandId,locationId);setMessage(result.message);}catch{setMessage('Forbindelsen blev afbrudt. Opdatér siden for at se importstatus.');}})}>{pending?'Henter anmeldelser…':'Hent Google-anmeldelser'}</button><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
