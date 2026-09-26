'use client';
import { useEffect, useState } from 'react';
import type { PublicScratchGame } from '@/lib/games/scratch-card';
import { ScratchGame } from './ScratchGame';
export function GamePlacement({brandSlug}:{brandSlug:string}){
  const [config,setConfig]=useState<{game:PublicScratchGame;brandName:string;path:string}|null>(null);
  useEffect(()=>{
    let active=true;
    const full=window.location.pathname.replace(/\/$/,'')||'/';
    const path=full===`/${brandSlug}`?'/':full.startsWith(`/${brandSlug}/`)?full.slice(brandSlug.length+1):full;
    fetch(`/api/public/games/config?brand=${encodeURIComponent(brandSlug)}&path=${encodeURIComponent(path)}`)
      .then(response=>response.ok?response.json():null)
      .then(data=>{if(active&&data?.game){let suppressed=false;try{suppressed=Number(localStorage.getItem(`orderfly-game-${data.game.brandId}`))>Date.now();}catch{}if(!suppressed)setConfig({...data,path});}}).catch(()=>{});
    return ()=>{active=false;};
  },[brandSlug]);
  return config?<div className="bg-neutral-950 px-4 py-12"><ScratchGame game={config.game} brandName={config.brandName} pathname={config.path}/></div>:null;
}
