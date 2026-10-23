import type { ReceiptSettings } from '@/lib/receipts/settings';
import type { ReceiptPreviewData } from '@/lib/receipts/preview';
export { SAMPLE_RECEIPT } from '@/lib/receipts/preview';
export type { ReceiptPreviewData } from '@/lib/receipts/preview';

function time(value?: string) {
  return value ? new Date(value).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : 'Dato ukendt';
}

export function ReceiptPreview({ settings, order }: { settings: ReceiptSettings; order: ReceiptPreviewData }) {
  const amount = (value: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: /^[A-Z]{3}$/.test(order.currency) ? order.currency : 'DKK' }).format(value);
  const row = (label: string, value: number, strong = false) => <div className={`flex justify-between gap-3 ${strong ? 'text-base font-bold' : ''}`}><span>{label}</span><span className="shrink-0">{amount(value)}</span></div>;
  return <article aria-label="Forhåndsvisning af kvittering" data-paper-width={settings.paperWidthMm} className="mx-auto max-w-full space-y-4 break-words border bg-white p-4 font-mono text-xs text-black shadow-sm" style={{ width: `${settings.paperWidthMm}mm`, overflowWrap: 'anywhere' }}>
    <header className="space-y-1 text-center">
      {order.logoUrl && <img src={order.logoUrl} alt="Virksomhedens logo" referrerPolicy="no-referrer" className="mx-auto max-h-20 max-w-full object-contain" />}
      <h2 className="text-base font-bold">{settings.heading}</h2>
      {settings.showBrandName && <p className="font-bold">{order.brandName}</p>}
      {settings.showLocationName && <p>{order.locationName}</p>}
      {order.seller && <><p>{order.seller.name || 'Virksomhedsnavn ikke angivet'}</p><p>CVR: {order.seller.registrationNumber || 'Ikke angivet'}</p><p>{order.seller.address || 'Adresse ikke angivet'}</p></>}
      {!order.seller && settings.address && <p className="whitespace-pre-wrap">{settings.address}</p>}
      {settings.phone && <p>{settings.phone}</p>}{settings.website && <p>{settings.website}</p>}
    </header>
    <section className="space-y-1 border-y border-dashed border-black py-3">
      <p>Ordre: {order.reference}</p>{order.invoiceNumber && <p>Bilag: {order.invoiceNumber}</p>}
      <p>Oprettet: {time(order.createdAt)}</p>{order.paidAt && <p>Betalt: {time(order.paidAt)}</p>}
      <p className="font-bold">{order.paymentStatus}</p><p>{order.paymentMethod}</p><p>{order.deliveryType} · {order.status}</p>
      {settings.showCustomer && order.customerName && <p>Kunde: {order.customerName}</p>}
      {settings.showContact && order.customerContact && <p>Kontakt: {order.customerContact}</p>}
    </section>
    <section className="space-y-3" aria-label="Varer">{order.lines.map((line, index) => <div key={index}>
      <div className="flex justify-between gap-3"><span>{line.quantity} × {line.name}</span><span className="shrink-0">{amount(line.total)}</span></div>
      <p>Stykpris: {amount(line.unitPrice)}</p>
      {settings.showModifiers && line.modifiers.map((modifier, i) => <p key={i} className="pl-2">+ {modifier}</p>)}
    </div>)}</section>
    <section className="space-y-1 border-t border-dashed border-black pt-3" aria-label="Beløb">
      {row('Subtotal', order.subtotal)}{order.discount !== 0 && row('Rabat', -order.discount)}
      {order.deliveryFee !== 0 && row('Levering', order.deliveryFee)}{order.bagFee !== 0 && row('Pose', order.bagFee)}
      {order.adminFee !== 0 && row('Administrationsgebyr', order.adminFee)}{order.tips !== 0 && row('Drikkepenge', order.tips)}
      {row('I alt', order.total, true)}{order.vat !== undefined && row('Heraf moms', order.vat)}
      {order.refunded > 0 && row('Refunderet', order.refunded)}
    </section>
    {settings.showNotes && order.notes && <p className="whitespace-pre-wrap">Bemærkning: {order.notes}</p>}
    {settings.footer && <footer className="whitespace-pre-wrap border-t border-dashed border-black pt-3 text-center">{settings.footer}</footer>}
  </article>;
}
