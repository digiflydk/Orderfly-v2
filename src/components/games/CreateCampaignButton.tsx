'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGameCampaign } from '@/app/superadmin/games/actions';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function CreateCampaignButton({brandId,brandName,hasBase,compact=false}:{brandId:string;brandName:string;hasBase:boolean;compact?:boolean}){
  const router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState('');
  if(!hasBase)return <Button asChild><a href={`/superadmin/games/scratch-card?brand=${encodeURIComponent(brandId)}`}><Plus className="mr-2 h-4 w-4"/>{compact?'Opret spil':`Opret spil · ${brandName}`}</a></Button>;
  return <div><Button type="button" disabled={pending} onClick={()=>start(async()=>{const result=await createGameCampaign(brandId);if(result.ok&&result.id)router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(brandId)}&campaign=${encodeURIComponent(result.id)}`);else setError(result.message);})}><Plus className="mr-2 h-4 w-4"/>{pending?'Opretter…':compact?'Opret spil':`Opret spil · ${brandName}`}</Button>{error&&<p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}</div>;
}
