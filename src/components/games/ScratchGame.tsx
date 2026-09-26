'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicScratchGame } from '@/lib/games/scratch-card';
import { ScratchSurface } from './ScratchCard';

type Props={game:PublicScratchGame;brandName:string;test?:boolean;pathname:string;embedOrigin?:string};
export function ScratchGame({game,brandName,test=false,pathname,embedOrigin}:Props){
  const [board,setBoard]=useState<string[]|null>(null);
  const [won,setWon]=useState(false);
  const [prize,setPrize]=useState<string|null>(null);
  const [mailQueued,setMailQueued]=useState(false);
  const [revealed,setRevealed]=useState(0);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [opened,setOpened]=useState(false);
  const [resultDismissed,setResultDismissed]=useState(false);
  const resultTitle=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    if(test)return;
    const eventId=crypto.randomUUID().replace(/-/g,'');
    void fetch('/api/public/games/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brandId:game.brandId,event:'game_impression',eventId,pathname})});
  },[game.brandId,pathname,test]);
  function track(event:'game_open'|'game_complete',eventId:string){
    if(!test)void fetch('/api/public/games/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brandId:game.brandId,event,eventId,pathname})});
  }
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setPending(true);setError('');
    const data=new FormData(event.currentTarget);
    try{
      const response=await fetch('/api/public/games/scratch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brandId:game.brandId,name:data.get('name'),email:data.get('email'),phone:data.get('phone')||'',newsletter:data.get('newsletter')==='on',pathname,test})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Prøv igen senere.');
      setBoard(result.board);setWon(result.won);setPrize(result.prizeName);setMailQueued(result.mailQueued);
      if(!test){
        const until=Date.now()+game.displayCooldownDays*86400000;
        try{localStorage.setItem(`orderfly-game-${game.brandId}`,String(until));}catch{}
        if(embedOrigin)window.parent.postMessage({type:'orderfly-game-played',brandId:game.brandId,until},embedOrigin);
      }
      if(result.eventId)setPlayEventId(result.eventId);
    }catch(e){setError(e instanceof Error?e.message:'Prøv igen senere.');}finally{setPending(false);}
  }
  const [playEventId,setPlayEventId]=useState<string|null>(null);
  const finished=!!board&&revealed===board.length;
  useEffect(()=>{
    if(!finished)return;
    if(playEventId)track('game_complete',playEventId);
    resultTitle.current?.focus();
  },[finished,playEventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const input='mt-1 w-full rounded-md border border-white/50 bg-white px-3 py-2 text-black';
  const prizeImage=game.prizes.find(item=>item.name===prize)?.imageUrl;
  const resultMessage=won
    ?test
      ?mailQueued?'Testkoden er lagt i mailkøen og kan ikke indløses.':'Der blev ikke sendt en testmail.'
      :mailQueued?'Din præmiekode er på vej til din e-mail.':'Din præmiekode kunne ikke sendes endnu.'
    :game.revealText;
  return <section className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl p-5 text-center text-white shadow-xl sm:p-8" style={{backgroundColor:game.surfaceColor,backgroundImage:game.backgroundUrl?`linear-gradient(#0009,#0009),url("${game.backgroundUrl}")`:undefined,backgroundSize:'cover',fontFamily:game.fontUrl?'ScratchBrandFont, system-ui':'system-ui'}}>
    {game.fontUrl&&<style>{`@font-face{font-family:ScratchBrandFont;src:url("${game.fontUrl}") format("woff2");font-display:swap}`}</style>}
    {game.logoUrl?<img src={game.logoUrl} alt={`${brandName} logo`} className="mx-auto mb-3 max-h-20 max-w-[200px] object-contain"/>:<div className="text-sm font-bold uppercase tracking-widest" style={{color:game.primaryColor}}>{brandName}</div>}
    <p className="text-xs uppercase tracking-widest" style={{color:game.primaryColor}}>{test?'Testspil':'Skrabelod'}</p>
    <h2 className="mt-3 text-2xl font-bold">{game.title}</h2><p className="mt-2 text-sm">{game.instruction}</p>
    {!board?<form onFocusCapture={()=>{if(!opened){setOpened(true);track('game_open',crypto.randomUUID().replace(/-/g,''));}}} onSubmit={submit} className="mt-6 space-y-4 text-left">
      <label className="block text-sm">Navn<input required name="name" autoComplete="name" minLength={2} maxLength={100} className={input}/></label>
      <label className="block text-sm">E-mail<input required name="email" type="email" autoComplete="email" maxLength={254} className={input}/></label>
      {game.collectPhone&&<label className="block text-sm">Telefon (valgfrit)<input name="phone" type="tel" autoComplete="tel" maxLength={30} className={input}/></label>}
      {!test&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" name="newsletter" className="mt-1"/><span>{game.newsletterText}</span></label>}
      <p className="text-xs text-white/75">{test?'Administrator-test: Ingen tilmelding til nyhedsbrev eller indløselig kode. Brug en ny test-e-mail for hver prøve.':'Deltagelse kræver ikke tilmelding til nyhedsbrevet. Én deltagelse pr. e-mail. Vi bruger dine oplysninger til at sende en eventuel gevinst.'}</p>
      <button disabled={pending} className="w-full rounded-md px-4 py-3 font-semibold text-black disabled:opacity-50" style={{backgroundColor:game.primaryColor}}>{pending?'Starter…':'Start spillet'}</button>
      {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
    </form>:<div className="mt-6">
      <div className="space-y-4">
        {Array.from({length:Math.ceil(board.length/3)},(_,ticket)=><div key={ticket} className="rounded-xl border border-white/30 p-2 sm:p-3">
          {board.length>3&&<p className="mb-2 text-sm font-semibold">Lod {ticket+1}</p>}
          <div className={`grid gap-2 ${board.slice(ticket*3,ticket*3+3).length===1?'grid-cols-1':'grid-cols-3'}`}>
            {board.slice(ticket*3,ticket*3+3).map((label,slot)=>{const index=ticket*3+slot;return <ScratchSurface key={index} index={index} round={0} label={label} imageUrl={game.prizes.find(p=>p.name===label)?.imageUrl||''} color={game.primaryColor} onReveal={()=>setRevealed(n=>n+1)}/>;})}
          </div>
        </div>)}
      </div>
      {finished&&<div role="status" className="mt-5 rounded-xl border border-white/30 p-4 text-center">
        <p className="text-lg font-bold">{won?`Du vandt ${prize}!`:game.revealText}</p>
        <p className="mt-2 text-sm">{resultMessage}</p>
        {resultDismissed&&<button type="button" onClick={()=>setResultDismissed(false)} className="mt-3 rounded-md border border-white/60 px-4 py-2 text-sm">Se resultatet igen</button>}
      </div>}
    </div>}
    {finished&&!resultDismissed&&<div className="game-result-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4" role="dialog" aria-modal="true" aria-labelledby="game-result-title">
      <style>{`@keyframes game-result-enter{from{opacity:0;transform:translateY(28px) scale(.86)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes game-confetti{0%{opacity:0;transform:translate3d(0,-100px,0) rotate(0deg)}12%{opacity:1}100%{opacity:0;transform:translate3d(var(--drift),480px,0) rotate(680deg)}}.game-result-card{animation:game-result-enter .65s cubic-bezier(.16,1,.3,1) both}.game-confetti{position:absolute;top:0;left:var(--left);width:9px;height:16px;border-radius:2px;background:var(--color);animation:game-confetti 2.7s ease-out var(--delay) both;pointer-events:none}@media(prefers-reduced-motion:reduce){.game-result-card,.game-confetti{animation:none}.game-confetti{display:none}}`}</style>
      {won&&Array.from({length:18},(_,index)=><span key={index} aria-hidden="true" className="game-confetti" style={{'--left':`${7+(index*37)%86}%`,'--drift':`${(index%2?-1:1)*(30+index*7)}px`,'--delay':`${(index%5)*.09}s`,'--color':index%3===0?game.primaryColor:index%3===1?'#fff':'#f59e0b'} as React.CSSProperties}/>)}
      <div className="game-result-card relative z-10 w-full max-w-sm rounded-3xl border-2 bg-[#171717] px-6 py-8 text-center text-white shadow-2xl" style={{borderColor:game.primaryColor}}>
        <p className="text-xs font-bold uppercase tracking-[.25em]" style={{color:game.primaryColor}}>{won?'Tillykke!':'Tak fordi du spillede'}</p>
        {won&&prizeImage&&<img src={prizeImage} alt={prize||'Præmie'} className="mx-auto mt-5 h-32 w-32 rounded-2xl bg-white object-contain p-2"/>}
        <h3 id="game-result-title" ref={resultTitle} tabIndex={-1} className="mt-5 text-3xl font-bold leading-tight outline-none">{won?`Du vandt ${prize}!`:game.revealText}</h3>
        <p className="mt-4 text-base text-white/85">{resultMessage}</p>
        <button type="button" onClick={()=>setResultDismissed(true)} className="mt-7 w-full rounded-lg px-5 py-3 font-bold text-black" style={{backgroundColor:game.primaryColor}}>Se mine lodder</button>
      </div>
    </div>}
  </section>;
}
