import type { KitchenSettings } from './kitchen-settings';
import type { KitchenPreviewData, DeliveryPrintDetails } from './kitchen-preview';
import type { ReceiptSettings } from './settings';
import type { ReceiptPreviewData } from './preview';

/** Coordinates are printer dots at 203 dpi. 30 dots = 10.64 pt: no small print. */
export const RECEIPT_LAYOUT_LIMITS = Object.freeze({ minFontDots: 30, heightDots: 8192, textCodeUnits: 65536, lines: 500, logoBytes: 524288 });
export type ReceiptSvg = { svg: string; width: number; height: number; text: string[]; categories: string[]; logoBox?: { x: number; y: number; width: number; height: number } };
export class ReceiptLayoutError extends Error { constructor() { super('receipt_layout_invalid'); } }
const fail = (): never => { throw new ReceiptLayoutError(); };
const xml = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const fontStyle = `<style>@font-face{font-family:'Orderfly Receipt';src:url('/fonts/orderfly/DejaVuSansMono.ttf') format('truetype');font-weight:400}@font-face{font-family:'Orderfly Receipt';src:url('/fonts/orderfly/DejaVuSansMono-Bold.ttf') format('truetype');font-weight:700}</style>`;
const chars = (text: string) => Array.from(text);
function validText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value.replace(/\n/g, ''))) return fail();
  return value.normalize('NFC');
}
function wrap(value: string, columns: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.split('\n')) {
    let remaining = chars(paragraph);
    if (!remaining.length) result.push('');
    while (remaining.length) {
      let count = Math.min(columns, remaining.length);
      if (count < remaining.length) {
        const breakAt = remaining.lastIndexOf(' ', count);
        if (breakAt > 0) count = breakAt;
      }
      result.push(remaining.splice(0, count).join(''));
      while (remaining[0] === ' ') remaining.shift();
    }
  }
  return result;
}
class Layout {
  readonly width: number;
  readonly margin = 16;
  readonly parts: string[] = [];
  readonly text: string[] = [];
  readonly categories: string[] = [];
  y = 16;
  private textUnits = 0;
  private lineCount = 0;
  constructor(width: number) { this.width = width === 80 ? 576 : width === 58 ? 384 : fail(); }
  gap(size = 18) { this.y += size; this.bound(); }
  private bound() { if (this.y > RECEIPT_LAYOUT_LIMITS.heightDots || this.lineCount > RECEIPT_LAYOUT_LIMITS.lines) fail(); }
  line(value: string, options: { size?: number; bold?: boolean; center?: boolean; indent?: number; inverse?: boolean; width?: number; checkbox?: boolean } = {}) {
    const text = validText(value), size = options.size ?? 34, indent = options.indent ?? 0;
    const checkboxSize = 24, checkboxSpace = options.checkbox ? checkboxSize + 12 : 0;
    if (size < RECEIPT_LAYOUT_LIMITS.minFontDots || size > 64) fail();
    this.textUnits += text.length; if (this.textUnits > RECEIPT_LAYOUT_LIMITS.textCodeUnits) fail();
    this.text.push(text);
    const available = (options.width ?? this.width - 2 * this.margin - indent) - checkboxSpace;
    // DejaVu Sans Mono advance is 0.6021 em; conservative 0.61 prevents edge clipping.
    const columns = Math.floor(available / (size * 0.61)); if (columns < 1) fail();
    const rows = wrap(text, columns), lineHeight = Math.ceil(size * 1.3);
    // One physical check-off box per item; continuation rows keep the text indent.
    if (options.checkbox) this.parts.push(`<rect data-paper-checkbox="true" x="${this.margin + indent}" y="${this.y + lineHeight - Math.ceil(size * 0.24) - checkboxSize}" width="${checkboxSize}" height="${checkboxSize}" fill="none" stroke="#000" stroke-width="2"/>`);
    for (const row of rows) {
      this.lineCount++; this.y += lineHeight; this.bound();
      this.parts.push(`<text x="${options.center ? this.width / 2 : this.margin + indent + checkboxSpace}" y="${this.y - Math.ceil(size * 0.24)}" font-size="${size}" font-weight="${options.bold ? 700 : 400}" text-anchor="${options.center ? 'middle' : 'start'}" fill="${options.inverse ? '#fff' : '#000'}">${xml(row)}</text>`);
    }
  }
  rule(dashed = false) {
    this.gap(12); this.parts.push(`<line x1="${this.margin}" y1="${this.y}" x2="${this.width - this.margin}" y2="${this.y}" stroke="#000" stroke-width="3"${dashed ? ' stroke-dasharray="7 5"' : ''}/>`); this.gap(16);
  }
  box(label: string, value: string) {
    const start = this.y; this.gap(10);
    this.line(label, { size: 30, bold: true, indent: 12, width: this.width - 2 * this.margin - 24 });
    this.line(value, { size: 34, bold: true, indent: 12, width: this.width - 2 * this.margin - 24 }); this.gap(12);
    this.parts.push(`<rect x="${this.margin}" y="${start}" width="${this.width - 2 * this.margin}" height="${this.y - start}" fill="none" stroke="#000" stroke-width="3"/>`); this.gap();
  }
  category(name: string) {
    this.categories.push(name); const start = this.y, index = this.parts.length; this.gap(5);
    this.line(name, { bold: true, inverse: true, indent: 10, width: this.width - 2 * this.margin - 20 }); this.gap(7);
    this.parts.splice(index, 0, `<rect x="${this.margin}" y="${start}" width="${this.width - 2 * this.margin}" height="${this.y - start}" fill="#000"/>`); this.gap(14);
  }
  amount(label: string, amount: string, bold = false) {
    // Keep the monetary amount on a separate right-aligned line if it cannot fit.
    const size = bold ? 36 : 30, columns = Math.floor((this.width - 2 * this.margin) / (size * 0.61));
    const gap = columns - chars(label).length - chars(amount).length;
    if (gap >= 1) this.line(label + ' '.repeat(gap) + amount, { size, bold });
    else { this.line(label, { size, bold }); this.line(amount, { size, bold }); }
  }
  finish(logoBox?: ReceiptSvg['logoBox']): ReceiptSvg {
    this.gap(16); const height = this.y;
    return { width: this.width, height, text: this.text, categories: this.categories, ...(logoBox ? { logoBox } : {}),
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${height}" viewBox="0 0 ${this.width} ${height}" role="img">${fontStyle}<rect width="${this.width}" height="${height}" fill="#fff"/><g font-family="Orderfly Receipt, DejaVu Sans Mono" xml:space="preserve">${this.parts.join('')}</g></svg>` };
  }
}
function date(value?: string, fallback = 'Dato ukendt') {
  if (!value) return fallback;
  const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}
function count(value: number | null) { return Number.isSafeInteger(value) && value! > 0 ? String(value) : '?'; }
function printDelivery(doc: Layout, delivery: DeliveryPrintDetails, kitchen = false) {
  doc.box('Leveringsadresse', delivery.address || 'Adresse ikke angivet');
  const interval = (value: { earliest: string; latest: string }) => value.earliest === value.latest
    ? date(value.earliest) : `${date(value.earliest)} – ${date(value.latest)}`;
  doc.line(`Ønsket levering: ${delivery.requested?.kind === 'asap' ? 'Hurtigst muligt' : delivery.requested?.kind === 'scheduled' ? interval(delivery.requested) : 'Ikke angivet'}`, { bold: true, size: 30 });
  if (delivery.pickupUnavailable) {
    doc.box(delivery.pickupUnavailable === 'cancelled' ? 'LEVERING ANNULLERET' : 'LEVERING MISLYKKET', 'Kontrollér ordren før tilberedning');
    return;
  }
  const pickup = delivery.reliablePickup ?? delivery.plannedPickup;
  if (kitchen && pickup) doc.box(delivery.reliablePickup ? 'Klar til afhentning' : 'Klar til afhentning (planlagt)', date(pickup.earliest));
  doc.line(delivery.reliablePickup ? `Forventet afhentning af bud: ${interval(delivery.reliablePickup)}` : delivery.plannedPickup ? `Planlagt afhentning af bud: ${interval(delivery.plannedPickup)}` : 'Afhentning af bud: Tidspunkt ikke bekræftet', { size: 30 });
}

export function renderKitchenReceiptSvg(settings: KitchenSettings, order: KitchenPreviewData): ReceiptSvg {
  if (!Array.isArray(order.lines) || order.lines.length > 100) return fail();
  const doc = new Layout(settings.paperWidthMm), body = settings.textSize === 'large' ? 36 : 30;
  if (settings.heading) doc.line(settings.heading, { bold: true, center: true, size: 36 });
  if (settings.showBrandName && order.brandName) doc.line(order.brandName, { center: true, size: 30 });
  if (settings.showLocationName && order.locationName) doc.line(order.locationName, { center: true, size: 30 });
  doc.gap();
  if (order.canceled) doc.box('ANNULLERET', 'MÅ IKKE TILBEREDES');
  doc.rule(); doc.line(`#${order.reference}`, { center: true, bold: true, size: settings.paperWidthMm === 58 ? 42 : 46 });
  doc.line(order.fulfillmentType.toUpperCase(), { center: true, bold: true, size: 36 });
  if (order.delivery) printDelivery(doc, order.delivery, true);
  else doc.line(date(order.fulfillmentAt, order.fulfillmentLabel || 'Tidspunkt ikke angivet'), { center: true, bold: true, size: 38 });
  doc.line(`Status: ${order.status}`, { center: true, size: 30 }); doc.rule();
  if (order.notes) doc.box('Bemærkning', order.notes);
  const sections: Array<{ name: string; lines: KitchenPreviewData['lines'] }> = [];
  for (const line of order.lines) {
    const name = settings.groupByCategory ? line.category || 'Varer' : 'Varer';
    const section = sections.find(row => row.name === name); if (section) section.lines.push(line); else sections.push({ name, lines: [line] });
  }
  for (const section of sections) {
    doc.category(section.name);
    for (const line of section.lines) {
      if (line.modifiers.length > 100 || line.groups.length > 100) return fail();
      doc.line(`${count(line.quantity)} × ${line.name}`, { bold: true, size: body });
      if (line.quantity === null) doc.line('Antal mangler. Kontrollér ordren.', { bold: true, size: 30 });
      for (const modifier of line.modifiers) doc.line(modifier, { bold: true, indent: 16, size: body, checkbox: true });
      if (line.groups.length) { doc.gap(8); doc.line('Menuindhold i alt', { bold: true, size: 30, indent: 16 }); }
      for (const group of line.groups) {
        if (group.products.length > 100) return fail();
        if (group.name) doc.line(group.name, { bold: true, size: 30, indent: 16 });
        for (const product of group.products) doc.line(`${count(product.quantity)} × ${product.name}`, { size: body, indent: 16, checkbox: true });
      }
      doc.rule(true);
    }
  }
  if (!order.lines.length) doc.box('Kontrollér ordren', 'Ingen varer registreret. Kontrollér ordren.');
  if (settings.showCustomer && order.customerName) doc.line(`Kunde: ${order.customerName}`, { bold: true, size: 30 });
  if (settings.showPhone && order.customerPhone) doc.line(`Telefon: ${order.customerPhone}`, { size: 30 });
  return doc.finish();
}
export function renderCustomerReceiptSvg(settings: ReceiptSettings, order: ReceiptPreviewData, options: { logoDataUri?: string } = {}): ReceiptSvg {
  if (!Array.isArray(order.lines) || order.lines.length > 100) return fail();
  const doc = new Layout(settings.paperWidthMm);
  let logoBox: ReceiptSvg['logoBox'];
  if (order.logoUrl || options.logoDataUri) {
    logoBox = { x: 32, y: doc.y, width: doc.width - 64, height: 120 };
    if (options.logoDataUri) {
      if (options.logoDataUri.length > RECEIPT_LAYOUT_LIMITS.logoBytes * 1.4 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(options.logoDataUri)) return fail();
      doc.parts.push(`<image x="${logoBox.x}" y="${logoBox.y}" width="${logoBox.width}" height="${logoBox.height}" preserveAspectRatio="xMidYMid meet" href="${options.logoDataUri}"/>`);
    }
    doc.gap(136);
  }
  if (settings.heading) doc.line(settings.heading, { bold: true, center: true, size: 36 });
  if (settings.showBrandName && order.brandName) doc.line(order.brandName, { bold: true, center: true, size: 30 });
  if (settings.showLocationName && order.locationName) doc.line(order.locationName, { center: true, size: 30 });
  if (order.seller) {
    doc.line(order.seller.name || 'Virksomhedsnavn ikke angivet', { center: true, size: 30 });
    doc.line(`CVR: ${order.seller.registrationNumber || 'Ikke angivet'}`, { center: true, size: 30 });
    doc.line(order.seller.address || 'Adresse ikke angivet', { center: true, size: 30 });
  } else if (settings.address) doc.line(settings.address, { center: true, size: 30 });
  for (const field of [settings.phone, settings.website]) if (field) doc.line(field, { center: true, size: 30 });
  doc.rule(true); doc.line(`Ordre: ${order.reference}`, { size: 30 });
  if (order.invoiceNumber) doc.line(`Bilag: ${order.invoiceNumber}`, { size: 30 });
  doc.line(`Oprettet: ${date(order.createdAt)}`, { size: 30 });
  if (order.paidAt) doc.line(`Betalt: ${date(order.paidAt)}`, { size: 30 });
  doc.line(order.paymentStatus, { bold: true, size: 30 }); doc.line(order.paymentMethod, { size: 30 });
  doc.line(`${order.deliveryType} · ${order.status}`, { size: 30 });
  if (order.delivery) printDelivery(doc, order.delivery);
  if (settings.showCustomer && order.customerName) doc.line(`Kunde: ${order.customerName}`, { size: 30 });
  if (settings.showContact && order.customerContact) doc.line(`Kontakt: ${order.customerContact}`, { size: 30 });
  doc.rule(true);
  const money = (value: number) => {
    if (!Number.isFinite(value)) return fail();
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: /^[A-Z]{3}$/.test(order.currency) ? order.currency : 'DKK' }).format(value);
  };
  for (const line of order.lines) {
    if (line.modifiers.length > 100) return fail();
    doc.line(`${count(line.quantity)} × ${line.name}`, { size: 30, bold: true });
    doc.amount('Stykpris', money(line.unitPrice)); doc.amount('Beløb', money(line.total));
    if (settings.showModifiers) for (const modifier of line.modifiers) doc.line(modifier, { size: 30, indent: 12 });
    doc.gap(12);
  }
  doc.rule(true); doc.amount('Subtotal', money(order.subtotal));
  for (const [label, value] of [['Rabat', -order.discount], ['Levering', order.deliveryFee], ['Pose', order.bagFee], ['Administrationsgebyr', order.adminFee], ['Drikkepenge', order.tips]] as const) if (value !== 0) doc.amount(label, money(value));
  doc.amount('I alt', money(order.total), true);
  if (order.vat !== undefined) doc.amount('Heraf moms', money(order.vat));
  if (order.refunded > 0) doc.amount('Refunderet', money(order.refunded));
  if ((settings.showNotes || order.delivery) && order.notes) { doc.gap(); doc.box('Bemærkning', order.notes); }
  if (settings.footer) { doc.rule(true); doc.line(settings.footer, { center: true, size: 30 }); }
  return doc.finish(logoBox);
}
