import type { ReceiptSvg } from '@/lib/receipts/print-layout';

/** The visible image is the same vector document the server rasterizes for CloudPRNT. */
export function ReceiptSvgPreview({ document, logoUrl }: { document: ReceiptSvg; logoUrl?: string }) {
  const logo = document.logoBox;
  let safeLogo: string | undefined;
  if (logoUrl) { try { const parsed = new URL(logoUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) safeLogo = parsed.href; } catch { /* no untrusted image URL */ } }
  return <>
    <style>{`.orderfly-receipt-svg > svg { display: block; width: 100%; height: auto; }`}</style>
    <div className="relative mx-auto max-w-full" style={{ width: `${document.width / 203 * 25.4}mm` }}>
      <div className="orderfly-receipt-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: document.svg }} />
      {safeLogo && logo && <img src={safeLogo} alt="Virksomhedens logo" referrerPolicy="no-referrer" style={{ position: 'absolute', objectFit: 'contain',
        left: `${logo.x / document.width * 100}%`, top: `${logo.y / document.height * 100}%`,
        width: `${logo.width / document.width * 100}%`, height: `${logo.height / document.height * 100}%` }} />}
    </div>
    <div className="sr-only" data-receipt-accessible-text="true">
      {document.text.map((line, index) => <p key={index}>{line}</p>)}
    </div>
  </>;
}
