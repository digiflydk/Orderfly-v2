'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { QrDraft } from './qr-manager';

export type QrPrintAsset = { content: string; mime: string; encoding?: string; filename: string };
export type QrPrintToolsProps = {
  draft: QrDraft;
  context: { id?: string; revision?: string };
  render: (draft: QrDraft, context: { id?: string; revision?: string }, options: {
    logoBase64?: string; format: 'png' | 'svg' | 'print';
  }) => Promise<QrPrintAsset>;
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const DEFAULT_STYLE: NonNullable<QrDraft['style']> = { width: 512, dark: '#000000', light: '#ffffff', margin: 4, errorCorrectionLevel: 'H' };
const buttonClass = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const isPng = (bytes: Uint8Array) => [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
const isJpeg = (bytes: Uint8Array) => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;

function assetBlob(asset: QrPrintAsset, format: 'png' | 'svg' | 'print'): Blob {
  if (typeof asset?.content !== 'string' || asset.content.length > 16 * 1024 * 1024) throw new Error('invalid_asset');
  const mime = format === 'png' ? 'image/png' : format === 'svg' ? 'image/svg+xml' : 'text/html';
  if (asset.mime !== mime) throw new Error('invalid_asset');
  if (format === 'png') {
    if (asset.encoding !== 'base64' || !/^[A-Za-z0-9+/]+={0,2}$/.test(asset.content)) throw new Error('invalid_asset');
    const bytes = Uint8Array.from(atob(asset.content), char => char.charCodeAt(0));
    if (!isPng(bytes)) throw new Error('invalid_asset');
    return new Blob([bytes], { type: mime });
  }
  if (asset.encoding && asset.encoding !== 'utf-8') throw new Error('invalid_asset');
  // The callback MUST use the authenticated server renderer. These checks reject
  // wrong/error responses, not substitute a general-purpose HTML sanitizer.
  if (/<\s*(script|iframe|object|embed|base|foreignObject)\b|\son[a-z]+\s*=/i.test(asset.content)) throw new Error('invalid_asset');
  if (format === 'svg' && !/^\s*<svg\b/i.test(asset.content)) throw new Error('invalid_asset');
  if (format === 'print' && (!/^<!doctype html>/i.test(asset.content)
      || !asset.content.includes("default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'"))) throw new Error('invalid_asset');
  return new Blob([asset.content], { type: mime });
}

export function QrPrintTools({ draft, context, render }: QrPrintToolsProps) {
  const [logo, setLogo] = useState<{ base64: string; name: string } | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const running = useRef(false), generation = useRef(0), input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>()), timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const pendingWindow = useRef<Window | null>(null);
  const scope = JSON.stringify([context.id, context.revision, draft.brandId, draft.locationId, draft.kind, draft.staticType]);
  useEffect(() => {
    generation.current++; running.current = false; setBusy(false); setLogo(null); setPreview(''); setError(''); setNotice('');
    if (input.current) input.current.value = '';
    return () => {
      generation.current++; running.current = false;
      pendingWindow.current?.close(); pendingWindow.current = null;
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, [scope]);
  const keepUrl = (blob: Blob, lifetime: number) => {
    const url = URL.createObjectURL(blob); urls.current.add(url);
    const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); timers.current.delete(timer); }, lifetime);
    timers.current.add(timer); return url;
  };
  const chooseLogo = async (file?: File) => {
    if (running.current) return;
    const at = ++generation.current; setError(''); setNotice(''); setLogo(null); setPreview('');
    if (!file) return;
    if (!file.size || file.size > MAX_LOGO_BYTES || (file.type && !['image/png', 'image/jpeg'].includes(file.type))) {
      setError('Vælg et PNG- eller JPEG-logo på højst 2 MB. SVG og webadresser kan ikke bruges.'); return;
    }
    running.current = true; setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isPng(bytes) && !isJpeg(bytes)) throw new Error('invalid_logo');
      let binary = '';
      for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      if (at === generation.current) setLogo({ base64: btoa(binary), name: file.name });
    } catch { if (at === generation.current) setError('Logoet kunne ikke læses som PNG eller JPEG. Vælg en anden fil.'); }
    finally { if (at === generation.current) { running.current = false; setBusy(false); } }
  };
  const needsSavedCode = draft.kind === 'dynamic' && (!context.id || !context.revision);
  const produce = async (format: 'png' | 'svg' | 'print' | 'preview') => {
    if (running.current || needsSavedCode) return;
    // Preopen synchronously from the click. A window opened after await may be
    // blocked; sever opener immediately without losing our navigation handle.
    const popup = format === 'print' ? window.open('about:blank', '_blank') : null;
    if (format === 'print' && !popup) { setError('Printvinduet blev blokeret. Tillad pop op-vinduer og prøv igen.'); return; }
    if (popup) { popup.opener = null; pendingWindow.current = popup; }
    const at = generation.current;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const value = logo ? { ...draft, style: { ...(draft.style || DEFAULT_STYLE), errorCorrectionLevel: 'H' as const } } : draft;
      const asset = await render(value, { ...context }, { format: format === 'preview' ? 'png' : format, ...(logo ? { logoBase64: logo.base64 } : {}) });
      if (at !== generation.current) { popup?.close(); return; }
      const blob = assetBlob(asset, format === 'preview' ? 'png' : format);
      if (format === 'preview') {
        setPreview(`data:image/png;base64,${asset.content}`);
        setNotice('Preview er klar med de valgte farver og logo.');
      } else if (popup) {
        if (popup.closed) throw new Error('window_closed');
        popup.location.replace(keepUrl(blob, 120000)); pendingWindow.current = null;
        setNotice('Printvinduet er åbnet. Vælg browserens Udskriv og eventuelt Gem som PDF.');
      } else {
        const link = document.createElement('a'); link.href = keepUrl(blob, 2000);
        link.download = String(asset.filename || `qr.${format}`).replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 160); link.rel = 'noopener';
        document.body.append(link); link.click(); link.remove(); setNotice('Download er klar.');
      }
    } catch {
      popup?.close(); pendingWindow.current = null;
      if (at === generation.current) setError('Eksporten kunne ikke bekræftes. Kontrollér størrelse, kontrast og logo, og prøv igen.');
    } finally { if (at === generation.current) { running.current = false; setBusy(false); } }
  };
  return <section aria-label="Logo og print" aria-busy={busy} className="qr-print-designer space-y-3 rounded-md border p-3" style={{ minWidth: 0 }}>
    <style>{PRINT_DESIGN_CSS}</style>
    <h3 className="font-semibold">Logo og print</h3>
    <div className="qr-print-columns"><div className="qr-print-controls">
    <p className="text-sm">Logoet bruges kun til denne eksport og gemmes ikke på QR-koden. Med logo bruges højeste fejlkorrektion, H.</p>
    <label className="qr-upload block">Logo, PNG eller JPEG, højst 2 MB<input ref={input} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => { void chooseLogo(event.target.files?.[0]); }} className="block w-full text-sm" /></label>
    {logo && <div className="flex flex-wrap items-center gap-2"><img src={`data:image/${isPng(Uint8Array.from(atob(logo.base64.slice(0, 12)), c => c.charCodeAt(0))) ? 'png' : 'jpeg'};base64,${logo.base64}`} alt="Valgt logo" width={56} height={56} className="qr-logo-swatch" /><p className="break-all text-sm">Valgt logo: {logo.name}</p><button type="button" className={buttonClass} disabled={busy} onClick={() => { generation.current++; setLogo(null); setPreview(''); if (input.current) input.current.value = ''; }}>Fjern logo</button></div>}
    <h4 className="qr-export-label">DOWNLOAD OG PRINT</h4>
    <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || needsSavedCode} onClick={() => { void produce('png'); }}>PNG med valgt logo</button><button type="button" className={buttonClass} disabled={busy || needsSavedCode} onClick={() => { void produce('svg'); }}>SVG med valgt logo</button><button type="button" className={buttonClass} disabled={busy || needsSavedCode} onClick={() => { void produce('print'); }}>Åbn print / Gem som PDF</button></div>
    {needsSavedCode && <p className="text-sm">Gem den dynamiske kode og åbn den igen før eksport.</p>}
    <p className="text-sm">PDF laves via browserens printvindue. Kontrollér det færdige tryk med en telefon, før det bruges.</p>
    </div><aside className="qr-print-preview" aria-label="Designpreview"><h4>FORHÅNDSVISNING</h4><div className="qr-preview-canvas">{preview ? <img src={preview} alt="QR-preview med valgt design og logo" width={300} height={300} /> : <div><strong>Dit QR-design</strong><p>Se koden med de valgte farver og dit logo før download.</p></div>}</div><button type="button" className={buttonClass} disabled={busy || needsSavedCode} onClick={() => { void produce('preview'); }}>{preview ? 'Opdater preview' : 'Vis designpreview'}</button><p>Preview og download bruger samme generator.</p></aside></div>
    {busy && <p role="status">Klargør eksport…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}

const PRINT_DESIGN_CSS = `
.qr-print-designer{padding:24px!important;border:1px solid #e1e7ee;border-radius:14px!important;background:#fff;color:#1c294c}.qr-print-designer h3{font-size:20px;margin:0 0 18px}.qr-print-columns{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(240px,1fr);gap:28px}.qr-print-controls{display:flex;flex-direction:column;gap:18px;min-width:0}.qr-print-controls>p{font-size:13px;line-height:1.7;color:#62718b}.qr-upload{padding:24px 18px;border:1px dashed #a8bdcc;border-radius:12px;background:#f7fafc;font-size:13px;font-weight:600;overflow-wrap:anywhere}.qr-upload input{margin-top:12px;width:100%;background:transparent!important;border:0!important;padding:0!important}.qr-upload input::file-selector-button{background:#fff;border:1px solid #cfdae5;padding:8px 12px;border-radius:7px;color:#1c294c;margin-right:8px;cursor:pointer}.qr-logo-swatch{width:56px;height:56px;object-fit:contain;border:1px solid #e1e7ee;padding:6px;border-radius:7px}.qr-export-label{font-size:11px;letter-spacing:1.5px;font-weight:700}.qr-print-preview{background:#f3f7fa;border-radius:12px;text-align:center;padding:20px;align-self:start}.qr-print-preview h4{font-size:11px;letter-spacing:1.4px;font-weight:700;margin-bottom:16px}.qr-preview-canvas{background:white;border-radius:8px;aspect-ratio:1;display:grid;place-items:center;padding:14px;margin:0 auto 18px;max-width:330px;box-shadow:0 2px 8px #1c294c08}.qr-preview-canvas img{width:100%;height:auto;max-width:300px}.qr-preview-canvas>div{padding:20px;color:#62718b}.qr-preview-canvas strong{font-size:17px;color:#1c294c}.qr-preview-canvas p{font-size:13px;line-height:1.7;margin-top:8px}.qr-print-preview>p{font-size:11px;color:#62718b;margin-top:12px}.qr-print-designer button{background:white;border:1px solid #d5dfea;border-radius:8px;padding:10px 12px;min-height:42px;font-size:13px;color:#1c294c;cursor:pointer}.qr-print-designer button:disabled{opacity:.5;cursor:not-allowed}.qr-print-designer :is(button,input):focus-visible{outline:3px solid #087da0;outline-offset:3px}
@media(max-width:720px){.qr-print-columns{grid-template-columns:1fr;gap:20px}.qr-print-designer{padding:16px!important}.qr-preview-canvas{max-width:280px}.qr-print-preview{padding:16px}}
`;
