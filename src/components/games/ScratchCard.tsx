'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScratchCardDraft } from '@/lib/games/scratch-card';
import { drawScratchBoard } from '@/lib/games/scratch-card-preview';

type Prize = ScratchCardDraft['prizes'][number];
// A drawn coin replaces the pointer over unscratched fields; the hotspot is its centre.
const COIN_SVG=`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><defs><radialGradient id="g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#f5c542"/><stop offset="1" stop-color="#b8860b"/></radialGradient></defs><circle cx="18" cy="18" r="16" fill="url(#g)" stroke="#8a6508" stroke-width="2"/><circle cx="18" cy="18" r="11.5" fill="none" stroke="#a87b0a" stroke-width="1.5" stroke-dasharray="2 2"/><text x="18" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#8a6508">kr</text></svg>`;
export const COIN_CURSOR=`url("data:image/svg+xml,${encodeURIComponent(COIN_SVG)}") 18 18, crosshair`;
export function ScratchSurface({label,index,round,imageUrl='',color='#ffbd02',compact=false,highlight=false,onReveal}:{label:string;index:number;round:number;imageUrl?:string;color?:string;compact?:boolean;highlight?:boolean;onReveal?:()=>void}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [revealed,setRevealed] = useState(false);
  function reveal(){if(!revealed){setRevealed(true);onReveal?.();}}
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
    ctx.fillStyle=color;
    ctx.font=`700 ${compact?13:16}px system-ui`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText('SKRAB HER',width/2,height/2);
  },[color,compact]);
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
    if(total&&clear/total>=.4)reveal();
  }
  return <div className="min-w-0">
    <div data-winning={highlight||undefined} style={highlight?{borderColor:color,boxShadow:`0 0 0 3px ${color}`}:undefined} className={`relative flex items-center justify-center overflow-hidden rounded-xl border-2 bg-white text-center font-bold text-black select-none ${compact?'h-24 p-1.5 text-sm sm:h-32 sm:text-base':'h-36 p-3 text-base sm:h-44 sm:text-lg'}`}>
      <span aria-live="polite">{revealed&&imageUrl?<img src={imageUrl} alt={label} className={`mx-auto object-contain ${compact?'max-h-14':'max-h-20'}`}/>:revealed?label:'Skrab feltet'}</span>
      {!revealed&&<canvas ref={canvas} role="button" tabIndex={0} style={{cursor:COIN_CURSOR}} className="absolute inset-0 h-full w-full touch-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400" aria-label={`Skrab felt ${index+1}. Brug finger eller mus, eller tryk Enter for tilgængelig afsløring.`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();reveal();}}} onPointerDown={event=>{drawing.current=true;event.currentTarget.setPointerCapture(event.pointerId);erase(event);}} onPointerMove={erase} onPointerUp={finish} onPointerCancel={finish}/>}
    </div>
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
    <div className="mt-6 rounded-xl border border-white/30 p-2 sm:p-3">
      <div className={`grid gap-2 ${cardsPerPlay===1?'grid-cols-1':cardsPerPlay===2?'grid-cols-2':'grid-cols-3'}`}>
        {Array.from({length:cardsPerPlay},(_,index)=><ScratchSurface key={`${round}-${index}`} index={index} round={round} compact={cardsPerPlay>3} label={outcomes[index]||'…'}/>)}
      </div>
    </div>
    <button type="button" onClick={()=>setRound(n=>n+1)} className="mt-5 rounded-md border border-white/60 px-4 py-2 text-sm">Ny test med samme sandsynligheder</button>
    <p className="mt-4 text-xs text-gray-400">Administrator-preview: Ingen præmie eller rabatkode bliver udstedt.</p>
  </section>;
}
