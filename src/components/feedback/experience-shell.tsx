import type { ReactNode } from 'react';
import { isEsmeraldaFeedback } from '@/lib/feedback/presentation';

export function ExperienceShell({ brandId, brandName, logoUrl, children }: { brandId: string; brandName: string; logoUrl?: string | null; children: ReactNode }) {
  const esmeralda = isEsmeraldaFeedback(brandId);
  return <main className="min-h-screen bg-[#f5f1e9] px-4 py-6 text-[#22231f] sm:py-12" data-testid="feedback-experience" data-brand={esmeralda ? 'esmeralda' : 'restaurant'}>
    <div className="mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-[#ded8cc] bg-[#fffdf8] shadow-[0_16px_60px_rgba(35,30,20,0.08)]">
      <header className="border-b-4 border-[#c5a358] bg-[#171c19] px-6 py-8 text-center text-[#f8f3e7]">
        {esmeralda ? <><div className="font-serif text-3xl tracking-[0.18em] sm:text-4xl">ESMERALDA</div><div className="mt-2 text-[10px] tracking-[0.3em] text-[#dcc18b]">PIZZA &amp; RESTAURANT · AMAGER</div></> : <>{logoUrl && <img src={logoUrl} alt="" className="mx-auto mb-3 max-h-16 max-w-[180px] object-contain" />}<div className="font-serif text-3xl">{brandName}</div></>}
      </header>
      {children}
      <footer className="border-t border-[#e8e0d2] px-6 py-5 text-center text-xs leading-6 text-[#68675e]">{esmeralda ? <>Esmeralda Pizza &amp; Restaurant<br />Albaniensgade 6 · 2300 København S</> : brandName}</footer>
    </div>
  </main>;
}
