import type { KitchenSettings } from '@/lib/receipts/kitchen-settings';
import type { KitchenPreviewData } from '@/lib/receipts/kitchen-preview';
export { SAMPLE_KITCHEN_RECEIPT } from '@/lib/receipts/kitchen-preview';
export type { KitchenPreviewData } from '@/lib/receipts/kitchen-preview';

function fulfillmentTime(order: KitchenPreviewData): string {
  if (order.fulfillmentAt) {
    const parsed = new Date(order.fulfillmentAt);
    if (Number.isFinite(parsed.getTime())) return new Intl.DateTimeFormat('da-DK', {
      timeZone: 'Europe/Copenhagen', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(parsed);
  }
  return order.fulfillmentLabel || 'Tidspunkt ikke angivet';
}

export function KitchenReceiptPreview({ settings, order }: { settings: KitchenSettings; order: KitchenPreviewData }) {
  const sections: Array<{ name: string; lines: KitchenPreviewData['lines'] }> = [];
  for (const line of order.lines) {
    const name = settings.groupByCategory ? line.category || 'Varer' : 'Varer';
    const section = sections.find(item => item.name === name);
    if (section) section.lines.push(line);
    else sections.push({ name, lines: [line] });
  }
  return <article aria-label="Forhåndsvisning af køkkenbon" data-paper-width={settings.paperWidthMm}
    className="mx-auto max-w-full space-y-4 break-words border bg-white p-3 font-mono text-black shadow-sm"
    style={{ width: `${settings.paperWidthMm}mm`, overflowWrap: 'anywhere', fontSize: settings.textSize === 'large' ? '18px' : '14px', lineHeight: 1.35 }}>
    <header className="space-y-1 text-center">
      {settings.heading && <h2 className="font-bold">{settings.heading}</h2>}
      {settings.showBrandName && order.brandName && <p className="text-sm">{order.brandName}</p>}
      {settings.showLocationName && order.locationName && <p className="text-sm">{order.locationName}</p>}
    </header>
    {order.canceled && <p className="border-4 border-black p-2 text-center text-xl font-black">ANNULLERET<br />MÅ IKKE TILBEREDES</p>}
    <section className="space-y-2 border-y-2 border-black py-3 text-center" aria-label="Ordreoplysninger">
      <p className="font-black" style={{ fontSize: '1.35em' }}>#{order.reference}</p>
      <p className="font-bold uppercase">{order.fulfillmentType}</p>
      <p className="font-black" style={{ fontSize: '1.15em' }}>{fulfillmentTime(order)}</p>
      <p className="text-sm">Status: {order.status}</p>
    </section>
    {order.notes && <section aria-label="Ordrebemærkning" className="border-2 border-black p-2">
      <p className="text-sm font-black uppercase">Bemærkning</p><p className="whitespace-pre-wrap font-bold">{order.notes}</p>
    </section>}
    <section aria-label="Retter" className="space-y-4">
      {sections.map((section, sectionIndex) => <div key={sectionIndex} className="space-y-3">
        <h3 className="px-2 py-1 font-bold" style={{ backgroundColor: '#000', color: '#fff' }}>{section.name}</h3>
        {section.lines.map((line, index) => <div key={index} className="space-y-2 border-b border-dashed border-black pb-3">
          <p className="font-black">{line.quantity ?? '?'} × {line.name}</p>
          {line.quantity === null && <p className="border border-black p-1 font-bold">Antal mangler. Kontrollér ordren.</p>}
          {line.modifiers.length > 0 && <div className="border-l-2 border-black pl-2">{line.modifiers.map((modifier, modifierIndex) => <p key={modifierIndex} className="whitespace-pre-wrap font-bold">{modifier}</p>)}</div>}
          {line.groups.length > 0 && <div className="space-y-2 pl-3">
            <p className="text-xs font-bold uppercase">Menuindhold i alt</p>
            {line.groups.map((group, groupIndex) => <div key={groupIndex}>
              {group.name && <p className="text-xs font-bold">{group.name}</p>}
              {group.products.map((product, productIndex) => <p key={productIndex}>{product.quantity ?? '?'} × {product.name}</p>)}
            </div>)}
          </div>}
        </div>)}
      </div>)}
      {!order.lines.length && <p className="border-2 border-black p-2 font-bold">Ingen varer registreret. Kontrollér ordren.</p>}
    </section>
    {(settings.showCustomer && order.customerName || settings.showPhone && order.customerPhone) && <footer className="border-t-2 border-black pt-3">
      {settings.showCustomer && order.customerName && <p className="font-bold">Kunde: {order.customerName}</p>}
      {settings.showPhone && order.customerPhone && <p>Telefon: {order.customerPhone}</p>}
    </footer>}
  </article>;
}
