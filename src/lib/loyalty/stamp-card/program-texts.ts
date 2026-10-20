import 'server-only';
import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { LoyaltyError } from './counter';
import type { ProgramDoc, ProgramTextsMeta } from './model';
import { renderProgramTexts, TEXT_FIELDS, textValues, type BrandTextSource, type Placeholder, type ProgramTexts, type TextField } from './texts';

// Server side of the standard texts: the brand data the placeholders read, and
// the filled texts for one program. The admin preview runs the same pure
// renderer on the same input, so it shows what the customer sees.

const BRAND_FIELDS = ['name', 'companyName', 'street', 'zipCode', 'city', 'companyRegNo', 'supportEmail', 'privacyUrl'] as const;
export type TextContext = { brand: BrandTextSource; activeLocations: number };

// Only the fields a placeholder reads leave the brand document.
export async function loadTextContext(db: Firestore, brandId: string, tx?: Transaction): Promise<TextContext> {
  const brandRef = db.collection('brands').doc(brandId), locationsQuery = db.collection('locations').where('brandId', '==', brandId);
  const [brand, locations] = tx ? await Promise.all([tx.get(brandRef), tx.get(locationsQuery)]) : await Promise.all([brandRef.get(), locationsQuery.get()]);
  const data: Record<string, unknown> = brand.data() ?? {};
  return {
    brand: Object.fromEntries(BRAND_FIELDS.map(f => [f, typeof data[f] === 'string' ? data[f] : null])) as BrandTextSource,
    activeLocations: locations.docs.filter(d => d.data().brandId === brandId && d.data().isActive !== false).length,
  };
}

export function renderForProgram(settings: ProgramDoc['settings'], texts: ProgramTextsMeta, ctx: TextContext) {
  return renderProgramTexts(settings, textValues({ brand: ctx.brand, settings, activeLocations: ctx.activeLocations,
    version: texts.version || null, effectiveFrom: texts.effectiveFrom }));
}

export const renderedHash = (texts: ProgramTexts) =>
  createHash('sha256').update(JSON.stringify(TEXT_FIELDS.map(f => texts[f]))).digest('hex');

// One filled variant of a published text version. A version normally has one;
// a later change to the brand's master data shows customers another.
export const renderedTextId = (brandId: string, textVersion: number, hash: string) =>
  createHash('sha256').update(JSON.stringify(['rendered', brandId, textVersion, hash])).digest('hex');

export type MissingText = { placeholder: Placeholder; fields: TextField[] };

// An active program cannot be saved while a customer-facing text cannot be filled.
export class TextsIncomplete extends LoyaltyError {
  constructor(public missing: MissingText[], public invalid: TextField[]) { super('texts_incomplete', 422); }
}
