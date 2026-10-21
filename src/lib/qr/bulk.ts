import { applyUtm, QrPayloadError, type DestinationOptions, type UtmTags } from './payload';

export const QR_CSV_MAX_ROWS = 100;
export const QR_CSV_MAX_BYTES = 128 * 1024;
export const QR_CSV_HEADERS = ['name', 'destination', 'brand_id', 'location_id', 'campaign', 'tags', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
type Header = typeof QR_CSV_HEADERS[number];
export type QrBulkScope = { brandId: string; locationIds: readonly string[]; allowBrandWide?: boolean };
export type QrBulkOptions = DestinationOptions & { allowedScopes: readonly QrBulkScope[] };
export type QrBulkEntry = { name: string; destination: string; brandId: string; locationId: string | null; campaign: string; tags: string[] };
export type QrBulkError = { row: number | null; field: string; code: 'invalid_csv' | 'too_large' | 'too_many_rows' | 'invalid_header' | 'invalid_field' | 'forbidden_scope' | 'invalid_destination' | 'duplicate_row' };
export type QrBulkPreview = { ok: boolean; rows: Array<{ row: number; entry: QrBulkEntry | null }>; errors: QrBulkError[]; plan: { schemaVersion: 1; entries: QrBulkEntry[]; canonical: string } | null };

class CsvError extends Error { constructor(public code: QrBulkError['code']) { super(code); } }

/** Strict comma/quote CSV parser; row numbers refer to records, not physical lines. */
function parseCsv(input: string): string[][] {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > QR_CSV_MAX_BYTES) throw new CsvError('too_large');
  const source = input.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) throw new CsvError('invalid_csv');
  const records: string[][] = [];
  let record: string[] = [], value = '', state: 'start' | 'bare' | 'quoted' | 'closed' = 'start';
  const cell = () => { record.push(value); value = ''; state = 'start'; if (record.length > QR_CSV_HEADERS.length) throw new CsvError('invalid_csv'); };
  const row = () => { cell(); records.push(record); record = []; if (records.length > QR_CSV_MAX_ROWS + 1) throw new CsvError('too_many_rows'); };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (state === 'quoted') {
      if (char === '"') { if (source[index + 1] === '"') { value += '"'; index++; } else state = 'closed'; }
      else value += char;
      continue;
    }
    if (char === ',') { cell(); continue; }
    if (char === '\n' || char === '\r') { if (char === '\r' && source[index + 1] === '\n') index++; row(); continue; }
    if (state === 'closed') throw new CsvError('invalid_csv');
    if (char === '"') { if (state !== 'start') throw new CsvError('invalid_csv'); state = 'quoted'; }
    else { value += char; state = 'bare'; }
  }
  if (state === 'quoted') throw new CsvError('invalid_csv');
  if (value || record.length || state !== 'start') row();
  return records;
}

function safeField(value: string, max: number, required = false): string | null {
  const normalized = value.trim();
  return normalized.length > max || /[\r\n\u0000-\u001f\u007f]/.test(normalized) || (required && !normalized) ? null : normalized;
}
const idValid = (s: string) => /^[A-Za-z0-9_-]{1,128}$/.test(s);

/** Preview only. No writes occur and ANY error suppresses the entire commit plan. */
export function previewQrCsv(csv: string, options: QrBulkOptions): QrBulkPreview {
  const errors: QrBulkError[] = [], rows: QrBulkPreview['rows'] = [];
  const result = (entries?: QrBulkEntry[]): QrBulkPreview => ({
    ok: errors.length === 0,
    rows,
    errors,
    plan: errors.length || !entries ? null : { schemaVersion: 1, entries, canonical: JSON.stringify({ schemaVersion: 1, entries }) },
  });
  let records: string[][];
  try { records = parseCsv(csv); } catch (error) {
    errors.push({ row: null, field: 'csv', code: error instanceof CsvError ? error.code : 'invalid_csv' }); return result();
  }
  if (records.length < 2) { errors.push({ row: null, field: 'csv', code: 'invalid_csv' }); return result(); }
  const header = records[0].map(name => name.trim());
  if (new Set(header).size !== header.length || header.some(name => !(QR_CSV_HEADERS as readonly string[]).includes(name))
    || ['name','destination','brand_id'].some(name => !header.includes(name))) {
    errors.push({ row: 1, field: 'header', code: 'invalid_header' }); return result();
  }
  const entries: QrBulkEntry[] = [], seen = new Set<string>();
  records.slice(1).forEach((record, index) => {
    const row = index + 2, startErrors = errors.length;
    const fail = (field: string, code: QrBulkError['code'] = 'invalid_field') => errors.push({ row, field, code });
    if (record.length !== header.length) { fail('csv', 'invalid_csv'); rows.push({row,entry:null}); return; }
    const values = Object.fromEntries(header.map((name, column) => [name, record[column]])) as Partial<Record<Header, string>>;
    const name = safeField(values.name ?? '', 120, true), brandId = safeField(values.brand_id ?? '', 128, true), location = safeField(values.location_id ?? '', 128);
    const campaign = safeField(values.campaign ?? '', 100), rawTags = safeField(values.tags ?? '', 410);
    if (name === null) fail('name');
    if (brandId === null || !idValid(brandId)) fail('brand_id');
    if (location === null || (location && !idValid(location))) fail('location_id');
    if (campaign === null) fail('campaign');
    const tags = rawTags === null || !rawTags ? [] : rawTags.split('|').map(tag => tag.trim());
    if (rawTags === null || tags.length > 10 || tags.some(tag => !tag || tag.length > 40)) fail('tags');
    const scope = options?.allowedScopes?.find(scope => scope.brandId === brandId);
    if (!scope || (location ? !scope.locationIds.includes(location) : scope.allowBrandWide !== true)) fail('brand_id', 'forbidden_scope');
    const utm: UtmTags = {};
    for (const key of ['source','medium','campaign','term','content'] as const) {
      const value = values[`utm_${key}`];
      if (value) utm[key] = value;
    }
    let destination = '';
    try { destination = applyUtm(values.destination ?? '', utm, {blockedOrigins:options?.blockedOrigins}); }
    catch (error) { fail(error instanceof QrPayloadError ? error.field : 'destination', 'invalid_destination'); }
    const duplicateKey = JSON.stringify([brandId, location, name]);
    if (seen.has(duplicateKey)) fail('name', 'duplicate_row');
    seen.add(duplicateKey);
    if (errors.length !== startErrors) { rows.push({row,entry:null}); return; }
    const entry: QrBulkEntry = { name: name!, destination, brandId: brandId!, locationId: location || null, campaign: campaign!, tags: [...new Set(tags)].sort() };
    entries.push(entry); rows.push({row,entry});
  });
  return result(entries);
}
