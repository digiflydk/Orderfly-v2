'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function ScratchCard({brandName,title,instruction,revealText}:{brandName:string;title:string;instruction:string;revealText:string}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [revealed,setRevealed] = useState(false);
  const [round,setRound] = useState(0);
  const paint = useCallback(() => {
    const surface = canvas.current;
    if (!surface) return;
    const width = surface.clientWidth, height = surface.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    surface.width = Math.round(width * ratio);
    surface.height = Math.round(height * ratio);
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio,ratio);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#303030';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#ffbd02';
    ctx.font = '700 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SKRAB HER',width/2,height/2);
  }, []);
  useEffect(() => {
    if (revealed) return;
    paint();
    const observer = new ResizeObserver(paint);
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  },[paint,round,revealed]);
  function erase(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || revealed) return;
    const surface = canvas.current, ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    const rect = surface.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc((event.clientX-rect.left)*ratio,(event.clientY-rect.top)*ratio,22*ratio,0,Math.PI*2);
    ctx.fill();
  }
  function finish() {
    drawing.current = false;
    const surface = canvas.current, ctx = surface?.getContext('2d');
    if (!surface || !ctx) return;
    const {data} = ctx.getImageData(0,0,surface.width,surface.height);
    let clear = 0, total = 0;
    for (let i=3;i<data.length;i+=64) {total++; if (data[i]<32) clear++;}
    if (total && clear/total >= .4) setRevealed(true);
  }
  return <section className="mx-auto max-w-md rounded-2xl border border-yellow-400 bg-[#111] p-6 text-center text-white shadow-xl">
    <div className="text-xs font-semibold uppercase tracking-[.2em] text-yellow-400">{brandName} · Scratch Card</div>
    <h2 className="mt-3 text-2xl font-bold">{title}</h2>
    <p className="mt-2 text-sm text-gray-300">{instruction}</p>
    <div className="relative mt-6 flex h-44 items-center justify-center overflow-hidden rounded-xl border-2 border-yellow-400 bg-[#ffbd02] px-5 text-xl font-bold text-black">
      <span aria-live="polite">{revealed ? revealText : 'Skrab feltet for at se resultatet'}</span>
      {!revealed && <canvas ref={canvas} className="absolute inset-0 h-full w-full cursor-crosshair touch-none" aria-label="Skrabefelt" onPointerDown={event=>{drawing.current=true; event.currentTarget.setPointerCapture(event.pointerId); erase(event);}} onPointerMove={erase} onPointerUp={finish} onPointerCancel={finish}/>}
    </div>
    {!revealed ? <button type="button" onClick={()=>setRevealed(true)} className="mt-4 rounded-md border border-white/60 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400">Afslør uden at skrabe</button>
      : <button type="button" onClick={()=>{setRevealed(false);setRound(n=>n+1);}} className="mt-4 rounded-md border border-white/60 px-4 py-2 text-sm">Prøv igen (kun preview)</button>}
    <p className="mt-4 text-xs text-gray-400">Administrator-preview: Ingen præmie eller rabatkode bliver udstedt.</p>
  </section>;
}
