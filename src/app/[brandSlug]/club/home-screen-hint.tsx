'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type InstallPrompt = Event & { prompt: () => Promise<void> };
type Platform = 'ios' | 'install' | 'android';

// A discreet guide to "Føj til hjemmeskærm" (spec §4.6), shown on phones after
// login until the customer closes it or opens the portal from the home screen.
export function HomeScreenHint({ slug }: { slug: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const key = `orderfly-club-home-screen-${slug}`;

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(key) === '1'; } catch { /* private mode: show it */ }
    if (standalone || dismissed || !window.matchMedia('(pointer: coarse)').matches) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    setPlatform(ios ? 'ios' : 'android');
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); setPlatform('install'); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, [key]);

  const close = () => {
    try { window.localStorage.setItem(key, '1'); } catch { /* nothing to remember */ }
    setPlatform(null);
  };

  if (!platform) return null;
  return (
    <aside aria-labelledby="club-home-screen" className="flex flex-col gap-2 rounded-xl border p-4 text-sm">
      <h2 id="club-home-screen" className="text-base font-semibold">Læg kortet på din hjemmeskærm</h2>
      {platform === 'ios' && <p>Tryk på Del-knappen i Safari, og vælg »Føj til hjemmeskærm«. Så åbner kortet med ét tryk.</p>}
      {platform === 'android' && <p>Åbn browserens menu (⋮), og vælg »Føj til startskærm«. Så åbner kortet med ét tryk.</p>}
      {platform === 'install' && <p>Så åbner kortet med ét tryk.</p>}
      <div className="flex gap-2">
        {platform === 'install' && installPrompt && (
          <Button type="button" variant="brand" className="min-h-11 flex-1" onClick={async () => { await installPrompt.prompt().catch(() => {}); close(); }}>Føj til hjemmeskærm</Button>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={close}>Luk</Button>
      </div>
    </aside>
  );
}
