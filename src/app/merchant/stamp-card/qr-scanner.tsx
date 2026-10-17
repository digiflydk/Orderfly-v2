'use client';

import { useEffect, useRef, useState } from 'react';
import { QR_TOKEN } from './messages';

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

// Native BarcodeDetector where available (Chrome on Android); jsQR otherwise (Safari on iPad).
async function createDecoder(canvas: HTMLCanvasElement): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats?.().catch(() => []) ?? ['qr_code']).includes('qr_code')) {
    const detector = new Native({ formats: ['qr_code'] });
    return async video => (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null;
  }
  const jsQR = (await import('jsqr')).default;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  return async video => {
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) return null;
    // Downscaled frames decode fast enough on tablets without visible lag.
    const scale = Math.min(1, 720 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

// Opens the rear camera and reports the first stamp-card token without an extra tap.
export function QrScanner({ onToken }: { onToken: (token: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const report = useRef(onToken); report.current = onToken;
  const [error, setError] = useState(''), [foreign, setForeign] = useState(false);

  useEffect(() => {
    let stopped = false, stream: MediaStream | null = null, timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return;
        video.current!.srcObject = stream;
        await video.current!.play().catch(() => {});
        const decode = await createDecoder(canvas.current!);
        const tick = async () => {
          if (stopped) return;
          const value = (await decode(video.current!))?.trim();
          if (stopped) return;
          if (value && QR_TOKEN.test(value)) { stopped = true; report.current(value); return; }
          setForeign(!!value);
          timer = setTimeout(tick, 150);
        };
        tick();
      } catch {
        if (!stopped) setError('Kameraet kunne ikke åbnes. Giv browseren adgang til kameraet, eller søg kunden på e-mail.');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, []);

  if (error) return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{error}</p>;
  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Kamera" />
        <div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-xl border-4 border-white/80" />
      </div>
      <canvas ref={canvas} hidden />
      <p role="status" className="text-center text-lg">{foreign ? 'Det er ikke en stempelkort-kode.' : 'Hold kundens QR-kode foran kameraet.'}</p>
    </div>
  );
}
