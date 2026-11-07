'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Gift } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStorefrontPath } from '@/hooks/use-storefront-path';
import './stamp-celebration.css';

type Award = { id: string; completedTarget: number; quantity: number; stamps: number; stampsRequired: number; rewardsEarned: number };
const seen = new Set<string>();
function claim(id: string) {
  const key = `orderfly:stamp-celebration:${id}`;
  if (seen.has(key)) return false;
  // If persistence is blocked, omit the optional popup rather than replay it on reload.
  try { if (localStorage.getItem(key)) return false; localStorage.setItem(key, '1'); } catch { return false; }
  seen.add(key); return true;
}

export function StampCelebration({ slug, orderId }: { slug: string; orderId: string }) {
  const [award, setAward] = useState<Award | null>(null);
  const [open, setOpen] = useState(false);
  const [landed, setLanded] = useState(false);
  const storefront = useStorefrontPath(slug);
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 12000);
    setAward(null); setOpen(false); setLanded(false);
    void fetch(`/api/loyalty/${encodeURIComponent(slug)}/order-stamp?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (stopped || !data?.award || !claim(data.award.id)) return;
        setAward(data.award); setOpen(true);
      }).catch(() => {}).finally(() => clearTimeout(deadline));
    return () => { stopped = true; controller.abort(); clearTimeout(deadline); };
  }, [slug, orderId]);
  useEffect(() => {
    if (!open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setLanded(true); return; }
    const timer = setTimeout(() => setLanded(true), 900);
    return () => clearTimeout(timer);
  }, [open]);
  if (!award) return null;
  const full = award.rewardsEarned > 0;
  const target = full ? award.completedTarget : award.stampsRequired;
  const count = full ? target : award.stamps;
  const previous = Math.max(0, count - award.quantity + (full ? award.stamps : 0));
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="stamp-celebration" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>('[data-order-receipt-title]')?.focus(); }}>
      <div className="stamp-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ left: `${5 + i * 6}%`, animationDelay: `${(i % 4) * 80}ms`, rotate: `${i * 37}deg` }} />)}</div>
      <div className="stamp-celebration-emblem" aria-hidden="true">{full ? <Gift size={36} /> : <Check size={36} />}</div>
      <DialogTitle className="text-center text-2xl font-bold">{full ? 'Dit stempelkort er fuldt!' : award.quantity === 1 ? 'Du har optjent et stempel!' : `Du har optjent ${award.quantity} stempler!`}</DialogTitle>
      <DialogDescription className="text-center text-base text-stone-300">{full ? (award.rewardsEarned > 1 ? 'Dine belønninger er klar.' : 'Din belønning er klar.') : 'Tak for din bestilling. Du er et skridt tættere på din belønning.'}</DialogDescription>
      <div className="stamp-celebration-card" aria-hidden="true">{Array.from({ length: target }, (_, i) => <span key={i} className={`stamp-slot ${i < count ? 'is-earned' : ''} ${i >= previous && i < count ? 'is-new' : ''}`}>{i < count ? <Check size={23} /> : i + 1}</span>)}</div>
      <p className="text-center text-xl font-semibold" aria-live="polite">{landed ? count : previous} af {target} stempler</p>
      <p className="text-center text-sm text-stone-300">{full ? (award.stamps > 0 ? `Du har også ${award.stamps} ${award.stamps === 1 ? 'stempel' : 'stempler'} på dit nye kort.` : 'Se din belønning på stempelkortet.') : `Kun ${award.stampsRequired - award.stamps} ${award.stampsRequired - award.stamps === 1 ? 'stempel' : 'stempler'} til din belønning.`}</p>
      <Button asChild className="stamp-celebration-primary"><Link href={storefront('club')} onClick={() => setOpen(false)}>Se mit stempelkort</Link></Button>
      <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}>Fortsæt</Button>
    </DialogContent>
  </Dialog>;
}
