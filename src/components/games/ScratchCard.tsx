'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScratchCardDraft } from '@/lib/games/scratch-card';
import { drawScratchBoard } from '@/lib/games/scratch-card-preview';

type Prize = ScratchCardDraft['prizes'][number];
function Surface({label,index,round}:{label:string;index:number;round:number}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [revealed,setRevealed] = useState(false);
  const paint = useCallback(() => {
    const surface=canvas.current;
    if(!surface) return;
    const width=surface.clientWidth,height=surface.clientHeight,ratio=window.devicePixelRatio||1;
    surface.width=Math.round(width*ratio);
    surface.height=Math.round(height*ratio);
    const ctx=surface.getContext('2d');
    if(!ctx) return;
    ctx.scale(ratio,ratio);
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#303030';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#ffbd02';
    ctx.font='700 16px system-ui';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('SKRAB HER',width/2,height/2);
  },[]);
  useEffect(()=>{
    if(revealed)return;
    paint();
    const observer=new ResizeObserver(paint);
    if(canvas.current)observer.observe(canvas.current);
    return ()=>observer.disconnect();
  },[paint,round,revealed]);
  function erase(event:React.PointerEvent<HTMLCanvasElement>) {
    if(!drawing.current||revealed)return;
    const surface=canvas.current,ctx=surface?.getContext('2d');
    if(!surface||!ctx)return;
    const rect=surface.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath();
    ctx.arc((event.clientX-rect.left)*ratio,(event.clientY-rect.top)*ratio,22*ratio,0,Math.PI*2);
    ctx.fill();
  }
  function finish() {
    drawing.current=false;
    const surface=canvas.current,ctx=surface?.getContext('2d');
    if(!surface||!ctx)return;
    const {data}=ctx.getImageData(0,0,surface.width,surface.height);
    let clear=0,total=0;
    for(let i=3;i<data.length;i+=64){total++;if(data[i]<32)clear++;}
    if(total&&clear/total>=.4)setRevealed(true);
  }
  return <div className="min-w-0">
    <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl border-2 border-yellow-400 bg-[#ffbd02] p-3 text-center text-base font-bold text-black sm:h-44 sm:text-lg">
      <span aria-live="polite">{revealed?label:`Kort ${index+1}`}</span>
      {!revealed&&<canvas ref={canvas} className="absolute inset-0 h-full w-full cursor-crosshair touch-none" aria-label={`Skrab kort ${index+1}`} onPointerDown={event=>{drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId);erase(event);}} onPointerMove={erase} onPointerUp={finish} onPointerCancel={finish}/>}
    </div>
    {!revealed&&<button type="button" onClick={()=>setRevealed(true)} className="mt-2 rounded-md border border-white/60 px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400">Afslør kort {index+1}</button>}
  </div>;
}
export function ScratchCard({brandName,logoUrl,title,instruction,noWinText,cardsPerPlay,prizes}:{brandName:string;logoUrl:string;title:string;instruction:string;noWinText:string;cardsPerPlay:number;prizes:Prize[]}) {
  const [round,setRound]=useState(0);
  const [outcomes,setOutcomes]=useState<string[]>([]);
  useEffect(()=>setOutcomes(drawScratchBoard(prizes,cardsPerPlay,noWinText,Math.random())),[round,cardsPerPlay,prizes,noWinText]);
  return <section className="w-full min-w-0 rounded-2xl border border-yellow-400 bg-[#111] p-4 text-center text-white shadow-xl sm:p-6">
    {logoUrl?<img src={logoUrl} alt={`${brandName} logo`} className="mx-auto mb-3 max-h-16 max-w-[180px] object-contain"/>:<div className="text-xs font-semibold uppercase tracking-[.2em] text-yellow-400">{brandName}</div>}
    <div className="text-xs font-semibold uppercase tracking-[.2em] text-yellow-400">Scratch Card · Test</div>
    <h2 className="mt-3 text-xl font-bold sm:text-2xl">{title}</h2>
    <p className="mt-2 text-sm text-gray-300">{instruction}</p>
    <div className={`mt-6 grid gap-3 ${cardsPerPlay>1?'grid-cols-2':'grid-cols-1'}`}>
      {Array.from({length:cardsPerPlay},(_,index)=><Surface key={`${round}-${index}`} index={index} round={round} label={outcomes[index]||'…'}/>)}
    </div>
    <button type="button" onClick={()=>setRound(n=>n+1)} className="mt-5 rounded-md border border-white/60 px-4 py-2 text-sm">Ny test med samme sandsynligheder</button>
    <p className="mt-4 text-xs text-gray-400">Administrator-preview: Ingen præmie eller rabatkode bliver udstedt.</p>
  </section>;
}
