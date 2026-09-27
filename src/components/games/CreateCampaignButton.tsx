'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGameCampaign } from '@/app/superadmin/games/actions';
export function CreateCampaignButton({brandId,brandName,hasBase}:{brandId:string;brandName:string;hasBase:boolean}){
  const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState('');
  if(!hasBase)return <a className="rounded-lg border px-4 py-2 text-sm" href={`/superadmin/games/scratch-card?brand=${encodeURIComponent(brandId)}`}>Opret første spil · {brandName}</a>;
  return <div><button type="button" disabled={pending} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={()=>start(async()=>{const result=await createGameCampaign(brandId);if(result.ok&&result.id)router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(brandId)}&campaign=${encodeURIComponent(result.id)}`);else setError(result.message);})}>+ Nyt skrabelod · {brandName}</button>{error&&<p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}</div>;
}
