'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { portalErrorText, portalRequest } from './portal-api';

// A code from the backend lives 60 seconds and works once; a newer code revokes
// the older the moment it is issued. The shown code is therefore hidden as soon
// as a renewal starts, and the moment it may have expired, so a slow connection,
// a screenshot or an offline phone never shows an invalid code as valid.
const LIFETIME = 60_000, RENEW_AFTER = 45_000, SAFETY = 3_000, RETRY = 5_000;

type Code = { svg: string; validUntil: number };

export function MemberQr({ slug, base }: { slug: string; base: string }) {
  const router = useRouter(), routerRef = useRef(router);
  routerRef.current = router;
  const [code, setCode] = useState<Code | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(), expiry = useRef<ReturnType<typeof setTimeout>>();
  const fetched = useRef(0), busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(timer.current); clearTimeout(expiry.current);
    setCode(null);
    const answer = await portalRequest<{ token: string; expiresAt: number }>(slug, 'qr');
    busy.current = false;
    const fail = (error: string) => {
      setFailure(error);
      if (document.visibilityState === 'visible') timer.current = setTimeout(load, RETRY);
    };
    if (!answer.ok) {
      if (answer.error === 'unauthorized') { window.location.assign(`${base}/login`); return; }
      return fail(answer.error);
    }
    // Remaining life by the server's clock, never more than a code's full lifetime.
    const remaining = Math.min(LIFETIME, Math.max(0, answer.data.expiresAt - answer.serverTime)) - SAFETY;
    let svg: string;
    try {
      svg = await QRCode.toString(answer.data.token, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } });
    } catch { return fail('unavailable'); }
    const validUntil = Date.now() + remaining;
    setCode({ svg, validUntil }); setFailure(null);
    clearTimeout(expiry.current);
    expiry.current = setTimeout(() => {
      setCode(null);
      if (document.visibilityState === 'visible') void load();
    }, Math.max(0, remaining));
    // Stamps may have been added at the counter since the page loaded.
    if (fetched.current++ > 0) routerRef.current.refresh();
    timer.current = setTimeout(load, Math.min(RENEW_AFTER, Math.max(0, remaining - 5_000)));
  }, [slug, base]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
      else clearTimeout(timer.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearTimeout(timer.current); clearTimeout(expiry.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [load]);

  // Keep the screen on while the card is open, where the browser supports it.
  // The browser drops the lock when the app is hidden, so it is taken again on return.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, active = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock.request('screen').then(l => { if (active) lock = l; else void l.release(); }).catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { active = false; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => {}); };
  }, []);

  return (
    <section aria-labelledby="club-qr" className="club-member-qr flex flex-col items-center gap-3 text-center">
      <h2 id="club-qr" className="text-2xl">Din QR-kode</h2>
      {code ? (
        <>
          <div role="img" aria-label="QR-kode til kassen" data-qr-valid-until={code.validUntil}
            className="w-full max-w-[320px] rounded-xl bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: code.svg }} />
          <p>Vis koden til medarbejderen ved kassen. Den skifter automatisk.</p>
        </>
      ) : failure ? (
        <div role="alert" className="flex w-full max-w-[320px] flex-col items-center justify-center gap-4 rounded-xl border p-6">
          <p className="font-semibold">{failure === 'network' ? 'Ingen forbindelse – QR-koden kan ikke vises' : 'QR-koden kan ikke vises lige nu'}</p>
          <p className="text-sm">{portalErrorText(failure)}</p>
          <Button type="button" variant="brand" size="lg" className="min-h-12 w-full text-base" onClick={() => { setFailure(null); void load(); }}>Prøv igen</Button>
        </div>
      ) : (
        <div role="status" className="flex aspect-square w-full max-w-[320px] items-center justify-center rounded-xl border">Henter QR-kode…</div>
      )}
    </section>
  );
}
