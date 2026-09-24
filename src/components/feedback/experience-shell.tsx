import type { ReactNode } from 'react';
import { isEsmeraldaFeedback } from '@/lib/feedback/presentation';
import { esmeraldaFeedbackAssets, esmeraldaFeedbackStyles } from '@/lib/feedback/brand-styles';

export function ExperienceShell({ brandId, brandName, logoUrl, children }: { brandId: string; brandName: string; logoUrl?: string | null; children: ReactNode }) {
  const esmeralda = isEsmeraldaFeedback(brandId);
  return <main className="min-h-screen bg-black px-4 pb-8 text-white sm:px-6 sm:pb-16" data-testid="feedback-experience" data-brand={esmeralda ? 'esmeralda' : 'restaurant'}>
    {esmeralda && <style>{esmeraldaFeedbackStyles}</style>}
    <div className="mx-auto max-w-[720px]">
      <header className="mb-8 flex min-h-[94px] items-center border-b border-white/10 py-4 sm:mb-12">
        {esmeralda ? <a href="https://www.esmeraldapizza.dk" aria-label="Esmeralda Pizza & Restaurant"><img src={esmeraldaFeedbackAssets.logo} alt="Esmeralda Pizza & Restaurant" className="es-header-v2__logo" width="142" height="77" /></a> : <>{logoUrl && <img src={logoUrl} alt="" className="mr-4 max-h-16 max-w-[180px] object-contain" />}<div className="text-3xl">{brandName}</div></>}
      </header>
      <div className="booking-widget-card rounded-2xl bg-[#111111]">{children}</div>
      <footer className="mt-8 border-t border-white/20 pt-6 text-left text-sm leading-6 text-white/80">{esmeralda ? <>Esmeralda Pizza &amp; Restaurant<br />Albaniensgade 6 · 2300 København S</> : brandName}</footer>
    </div>
  </main>;
}
